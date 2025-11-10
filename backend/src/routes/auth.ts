/// <reference path="../types/fastify.d.ts" />
import { FastifyInstance } from 'fastify';
import prisma from '../utils/prisma';
import axios from 'axios';
import fastifyOauth2 from '@fastify/oauth2';
import {
  generateAuthToken,
  validateAuthToken,
  revokeToken,
} from '../utils/tokenUtils';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export async function authRoutes(fastify: FastifyInstance) {
  const backendUrl = (
    process.env.BACKEND_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');
  const frontendUrl = (
    process.env.FRONTEND_URL || 'http://localhost:3001'
  ).replace(/\/+$/, '');

  logger.auth('Initializing OAuth routes');
  logger.debug('Backend URL:', backendUrl);
  logger.debug('Frontend URL:', frontendUrl);
  logger.auth(
    'GitHub Client ID:',
    process.env.GITHUB_CLIENT_ID ? 'Set' : 'Missing'
  );

  // Register OAuth2 plugin
  await fastify.register(fastifyOauth2, {
    name: 'githubOAuth2',
    credentials: {
      client: {
        id: process.env.GITHUB_CLIENT_ID!,
        secret: process.env.GITHUB_CLIENT_SECRET!,
      },
      auth: fastifyOauth2.GITHUB_CONFIGURATION,
    },
    startRedirectPath: '/auth/github',
    callbackUri: `${backendUrl}/auth/github/callback`,
    scope: ['read:user', 'user:email', 'repo'],
  });

  logger.auth('OAuth2 plugin registered at /auth/github');

  // GitHub OAuth callback handler
  fastify.get('/auth/github/callback', async (request, reply) => {
    logger.auth('OAuth callback received');
    logger.debug('Callback query params:', request.query);

    try {
      const { token } =
        await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(
          request
        );
      logger.auth('Access token received from GitHub');

      // Fetch user info from GitHub
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      });

      const githubUser = userResponse.data;
      logger.auth('GitHub user fetched:', {
        id: githubUser.id,
        login: githubUser.login,
        email: githubUser.email || 'not provided',
      });

      // Fetch user email
      let email = githubUser.email;
      if (!email) {
        try {
          logger.debug('Fetching user email from GitHub API');
          const emailResponse = await axios.get(
            'https://api.github.com/user/emails',
            {
              headers: {
                Authorization: `Bearer ${token.access_token}`,
              },
            }
          );
          const primaryEmail = emailResponse.data.find((e: any) => e.primary);
          email = primaryEmail
            ? primaryEmail.email
            : emailResponse.data[0]?.email;
          logger.debug('Email fetched:', email);
        } catch (error) {
          logger.error('Failed to fetch user email:', error);
        }
      }

      // Store or update user in database
      logger.debug('Upserting user in database');
      const user = await prisma.user.upsert({
        where: { githubId: githubUser.id },
        update: {
          username: githubUser.login,
          email: email,
          avatarUrl: githubUser.avatar_url,
          accessToken: token.access_token,
          updatedAt: new Date(),
        },
        create: {
          githubId: githubUser.id,
          username: githubUser.login,
          email: email,
          avatarUrl: githubUser.avatar_url,
          accessToken: token.access_token,
        },
      });
      logger.auth('User saved to database:', {
        id: user.id,
        username: user.username,
        githubId: user.githubId,
      });

      // Store user ID in session (keep for backward compatibility)
      request.session.userId = user.id;
      request.session.githubToken = token.access_token;
      logger.debug('Session created:', {
        userId: request.session.userId,
      });

      // Explicitly save session to ensure cookie is set
      await request.session.save();
      logger.debug('Session saved');

      // Generate JWT token for token-based auth
      const sessionId = request.session.id || `session-${Date.now()}`;
      const authToken = generateAuthToken(user.id, sessionId);
      logger.auth('JWT token generated for user:', user.id);

      // Redirect to frontend with token
      const redirectUrl = `${frontendUrl}?auth=success&token=${authToken}`;
      logger.auth('Redirecting to frontend');
      return reply.redirect(redirectUrl);
    } catch (error: any) {
      logger.error('OAuth callback error:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      return reply.status(500).send({
        error: 'Authentication failed',
        message: error.message,
      });
    }
  });

  // Get current user
  fastify.get('/auth/me', async (request, reply) => {
    logger.debug('/auth/me requested');
    logger.debug('Request headers:', {
      authorization: request.headers.authorization
        ? 'Present (Bearer token)'
        : 'Missing',
      cookie: request.headers.cookie
        ? `Present (${request.headers.cookie.substring(0, 50)}...)`
        : 'Missing',
      origin: request.headers.origin,
      referer: request.headers.referer,
    });

    let userId: number | null = null;

    // Try token-based auth first
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      logger.debug('Token found in Authorization header, validating...');
      userId = await validateAuthToken(token);

      if (userId) {
        logger.auth('Token validated successfully, userId:', userId);
      } else {
        logger.warn('Token validation failed');
      }
    }

    // Fall back to session-based auth
    if (!userId) {
      logger.debug('Trying session-based auth...');
      userId = request.session?.userId || null;
      logger.debug('Session data:', {
        userId: request.session?.userId,
        hasSession: !!request.session,
        sessionId: request.session?.id || 'N/A',
      });
    }

    if (!userId) {
      logger.warn('No valid authentication found - returning 401');
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    logger.debug('Fetching user from database:', userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        githubId: true,
        username: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        // Don't send accessToken
      },
    });

    if (!user) {
      logger.warn('User not found in database:', userId);
      return reply.status(404).send({ error: 'User not found' });
    }

    logger.debug('User found:', { id: user.id, username: user.username });
    return reply.send({ user });
  });

  // Logout
  fastify.post('/auth/logout', async (request, reply) => {
    logger.auth('Logout requested');

    // Revoke token if provided
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = jwt.decode(token) as any;
        if (payload?.sessionId) {
          revokeToken(payload.sessionId);
          logger.auth('Token revoked');
        }
      } catch (error) {
        logger.error('Error revoking token:', error);
      }
    }

    // Also destroy session (for backward compatibility)
    logger.debug('Session before destroy:', {
      userId: request.session?.userId,
    });
    await request.session.destroy();
    logger.debug('Session destroyed');

    return reply.send({ message: 'Logged out successfully' });
  });

  // Get user token (for internal use, protected route)
  fastify.get('/auth/token', async (request, reply) => {
    const userId = request.session?.userId;

    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accessToken: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ token: user.accessToken });
  });
}
