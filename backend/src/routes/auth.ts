/// <reference path="../types/fastify.d.ts" />
import { FastifyInstance } from 'fastify';
import prisma from '../utils/prisma';
import axios from 'axios';
import fastifyOauth2 from '@fastify/oauth2';

export async function authRoutes(fastify: FastifyInstance) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

  console.log('[AUTH] Initializing OAuth routes');
  console.log('[AUTH] Backend URL:', backendUrl);
  console.log('[AUTH] Frontend URL:', frontendUrl);
  console.log('[AUTH] GitHub Client ID:', process.env.GITHUB_CLIENT_ID ? 'Set' : 'Missing');

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

  console.log('[AUTH] OAuth2 plugin registered at /auth/github');

  // GitHub OAuth callback handler
  fastify.get('/auth/github/callback', async (request, reply) => {
    console.log('[AUTH] OAuth callback received');
    console.log('[AUTH] Callback query params:', request.query);
    
    try {
      const { token } = await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      console.log('[AUTH] Access token received from GitHub');

      // Fetch user info from GitHub
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      });

      const githubUser = userResponse.data;
      console.log('[AUTH] GitHub user fetched:', {
        id: githubUser.id,
        login: githubUser.login,
        email: githubUser.email || 'not provided',
      });

      // Fetch user email
      let email = githubUser.email;
      if (!email) {
        try {
          console.log('[AUTH] Fetching user email from GitHub API');
          const emailResponse = await axios.get('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
            },
          });
          const primaryEmail = emailResponse.data.find((e: any) => e.primary);
          email = primaryEmail ? primaryEmail.email : emailResponse.data[0]?.email;
          console.log('[AUTH] Email fetched:', email);
        } catch (error) {
          console.error('[AUTH] Failed to fetch user email:', error);
        }
      }

      // Store or update user in database
      console.log('[AUTH] Upserting user in database');
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
      console.log('[AUTH] User saved to database:', {
        id: user.id,
        username: user.username,
        githubId: user.githubId,
      });

      // Store user ID in session
      request.session.userId = user.id;
      request.session.githubToken = token.access_token;
      console.log('[AUTH] Session created:', {
        userId: request.session.userId,
      });

      // Redirect to frontend
      const redirectUrl = `${frontendUrl}?auth=success`;
      console.log('[AUTH] Redirecting to frontend:', redirectUrl);
      return reply.redirect(redirectUrl);
    } catch (error: any) {
      console.error('[AUTH] OAuth callback error:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      return reply.status(500).send({ 
        error: 'Authentication failed',
        message: error.message 
      });
    }
  });

  // Get current user
  fastify.get('/auth/me', async (request, reply) => {
    console.log('[AUTH] /auth/me requested');
    console.log('[AUTH] Session data:', {
      userId: request.session?.userId,
      hasSession: !!request.session,
    });
    console.log('[AUTH] Request headers:', {
      cookie: request.headers.cookie ? 'Present' : 'Missing',
      origin: request.headers.origin,
    });

    const userId = request.session?.userId;

    if (!userId) {
      console.log('[AUTH] No userId in session - returning 401');
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    console.log('[AUTH] Fetching user from database:', userId);
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
      console.log('[AUTH] User not found in database:', userId);
      return reply.status(404).send({ error: 'User not found' });
    }

    console.log('[AUTH] User found:', { id: user.id, username: user.username });
    return reply.send({ user });
  });

  // Logout
  fastify.post('/auth/logout', async (request, reply) => {
    console.log('[AUTH] Logout requested');
    console.log('[AUTH] Session before destroy:', {
      userId: request.session?.userId,
    });
    await request.session.destroy();
    console.log('[AUTH] Session destroyed');
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

