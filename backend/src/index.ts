/// <reference path="./types/fastify.d.ts" />
import fastify from 'fastify';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { enqueueCommitJob } from './services/queueService';
import { getLeaderboardForRepository } from './services/repoService';
import {
  refreshContributorData,
  refreshPartialRepositories,
} from './services/refreshService';
import { isValidGitHubUrl } from './utils/isValidGitHubUrl';
import { normalizeRepoUrl } from './utils/normalizeUrl';
import { authRoutes } from './routes/auth';
import { getUserToken } from './utils/getUserToken';
import { populateDemoRepos } from './utils/populateDemoRepos';
import { logger } from './utils/logger';
import { getVersion } from './utils/version';
import { redisSessionStore } from './utils/redisSessionStore';

dotenv.config();

const app = fastify({ logger: true });

// Start the server
const startServer = async () => {
  try {
    const version = getVersion();
    console.log('[SERVER] Starting server...');
    console.log(`[SERVER] API Version: ${version}`);
    logger.info('[SERVER] Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      FRONTEND_URL: process.env.FRONTEND_URL,
      BACKEND_URL: process.env.BACKEND_URL,
      SESSION_SECRET: process.env.SESSION_SECRET ? 'Set' : 'Missing',
      POPULATE_DEMO_REPOS: process.env.POPULATE_DEMO_REPOS || 'false',
    });

    // Populate demo repos if enabled
    if (process.env.POPULATE_DEMO_REPOS === 'true') {
      logger.info(
        '[SERVER] POPULATE_DEMO_REPOS is enabled, populating demo repositories...'
      );
      try {
        await populateDemoRepos({ silent: false });
        logger.info('[SERVER] Demo repositories population completed.');
      } catch (error) {
        logger.error('[SERVER] Error populating demo repos:', error);
        // Don't fail server startup if demo population fails
      }
    }

    // Register CORS
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const isProduction = process.env.NODE_ENV === 'production';
    const corsOrigins = isProduction
      ? [frontendUrl] // Use FRONTEND_URL from environment
      : frontendUrl;
    logger.info('[SERVER] Registering CORS for:', corsOrigins);
    await app.register(require('@fastify/cors'), {
      origin: corsOrigins,
      credentials: true,
    });
    logger.info('[SERVER] CORS registered');

    // Register cookie plugin
    logger.info('[SERVER] Registering cookie plugin');
    await app.register(require('@fastify/cookie'));
    logger.info('[SERVER] Cookie plugin registered');

    // Register session plugin
    logger.info('[SERVER] Registering session plugin');
    const sessionConfig: any = {
      cookieName: 'sessionId',
      secret:
        process.env.SESSION_SECRET ||
        'a-very-long-random-string-change-in-production',
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        path: '/', // Ensure cookie is available for all paths
        // Use 'none' for OAuth redirects from GitHub (requires secure: true in production)
        // Use 'lax' for local development (works with http://)
        sameSite: isProduction ? 'none' : 'lax',
        // Don't set domain explicitly - let browser handle it for cross-site cookies
      },
    };

    // Use Redis store in production (required for multi-instance Cloud Run)
    // Use in-memory store in development (simpler, no Redis required)
    if (isProduction) {
      sessionConfig.store = redisSessionStore;
      logger.info('[SERVER] Using Redis session store (production)');
    } else {
      logger.info('[SERVER] Using in-memory session store (development)');
    }

    await app.register(require('@fastify/session'), sessionConfig);
    logger.info('[SERVER] Session plugin registered');

    // Register auth routes
    logger.info('[SERVER] Registering auth routes');
    await app.register(authRoutes);
    logger.info('[SERVER] Auth routes registered');

    // Register routes
    app.get('/health', async (request, reply) => {
      return reply.status(200).send({ message: 'Server is running.' });
    });

    app.get('/version', async (request, reply) => {
      const version = getVersion();
      return reply.status(200).send({
        api: version,
        commitWorker: version, // Commit worker version (same codebase)
        userWorker: version, // User worker version (same codebase)
      });
    });

    app.post('/leaderboard', async (request, reply) => {
      const { repoUrl } = request.query as { repoUrl?: string };
      const { authorization } = request.headers;

      if (!repoUrl) {
        return reply
          .status(400)
          .send({ error: 'repoUrl query parameter is required' });
      }

      if (!isValidGitHubUrl(repoUrl)) {
        return reply
          .status(400)
          .send({ error: 'Invalid GitHub repository URL.' });
      }

      const normalizedUrl = normalizeRepoUrl(repoUrl);
      try {
        let dbRepository = await prisma.repository.findUnique({
          where: { url: normalizedUrl },
        });

        if (!dbRepository) {
          const repoName =
            normalizedUrl.split('/').pop()?.replace('.git', '') ||
            'default_repo';
          dbRepository = await prisma.repository.create({
            data: {
              url: normalizedUrl,
              pathName: repoName,
              state: 'pending',
              lastAttempt: new Date(),
            },
          });

          // Get token from authenticated user session, or fall back to Authorization header, or use env token
          let token: string | null = null;
          const userToken = await getUserToken(request);
          if (userToken) {
            token = userToken;
          } else if (authorization) {
            token = authorization.replace('Bearer ', '');
          }

          await enqueueCommitJob(
            dbRepository.id,
            normalizedUrl,
            repoName,
            token
          );
        }

        switch (dbRepository.state) {
          case 'pending':
          case 'commits_processing':
            return reply.status(202).send({
              message: 'Repository commits are being processed.',
              stage: 'commits',
            });
          case 'users_processing':
            return reply.status(202).send({
              message: 'Repository user data is being processed.',
              stage: 'users',
            });
          case 'failed':
            return reply.status(500).send({
              message: 'Repository processing failed.',
              lastProcessedAt: dbRepository.lastProcessedAt,
            });
          case 'completed':
            return reply.status(200).send({
              message: 'Repository processed successfully.',
              lastProcessedAt: dbRepository.lastProcessedAt,
            });
          default:
            return reply
              .status(202)
              .send({ message: 'Repository processing started.' });
        }
      } catch (error) {
        return reply
          .status(500)
          .send({ error: 'Failed to process the leaderboard request.' });
      }
    });

    app.get('/leaderboard', async (request, reply) => {
      const { repoUrl } = request.query as { repoUrl?: string };

      if (!repoUrl) {
        return reply
          .status(400)
          .send({ error: 'repoUrl query parameter is required' });
      }

      if (!isValidGitHubUrl(repoUrl)) {
        return reply
          .status(400)
          .send({ error: 'Invalid GitHub repository URL.' });
      }

      const normalizedUrl = normalizeRepoUrl(repoUrl);

      let dbRepository = null;
      try {
        // Check if the repository already exists in the database
        dbRepository = await prisma.repository.findUnique({
          where: { url: normalizedUrl },
        });

        if (!dbRepository) {
          return reply.status(404).send({
            error:
              'Repository not found, remember to submit for processing first.',
          });
        }

        switch (dbRepository.state) {
          case 'commits_processing':
          case 'users_processing':
          case 'pending':
            return reply
              .status(202)
              .send({ message: 'Repository still processing.' });
          case 'completed':
            const leaderboard = await getLeaderboardForRepository(dbRepository);
            return reply.status(200).send({
              ...leaderboard,
            });
          default:
            return reply
              .status(404)
              .send({ error: 'Repository processing status unknown.' });
        }
      } catch (error) {
        logger.error('Error in /leaderboard:', error);
        return reply
          .status(500)
          .send({ error: 'Failed to return leaderboard.' });
      }
    });

    app.get('/repositories', async (req, reply) => {
      try {
        const repositories = await prisma.repository.findMany();
        return reply.status(200).send(repositories);
      } catch (error) {
        logger.error('Failed to fetch repository jobs:', error);
        reply.status(500).send({ error: 'Failed to fetch repository jobs' });
      }
    });

    app.post('/refresh', async (request, reply) => {
      const { authorization } = request.headers;

      try {
        // Get token from authenticated user session, or fall back to Authorization header, or use env token
        let token: string | null = null;
        const userToken = await getUserToken(request);
        if (userToken) {
          token = userToken;
        } else if (authorization) {
          token = authorization.replace('Bearer ', '');
        }

        logger.info('[REFRESH] Refresh endpoint called');
        const result = await refreshPartialRepositories(token);

        if (result.rateLimitHit) {
          return reply.status(429).send({
            message:
              'Refresh partially completed but hit rate limit. Some data may still be incomplete.',
            ...result,
          });
        }

        return reply.status(200).send({
          message: 'Refresh completed successfully.',
          ...result,
        });
      } catch (error: any) {
        logger.error('Error refreshing contributors:', error);
        return reply.status(500).send({
          error: 'Failed to refresh contributor data.',
          message: error.message,
        });
      }
    });

    app.post('/repositories/retry', async (request, reply) => {
      const { repoUrl } = request.query as { repoUrl?: string };
      const { authorization } = request.headers;

      if (!repoUrl) {
        return reply
          .status(400)
          .send({ error: 'repoUrl query parameter is required' });
      }

      if (!isValidGitHubUrl(repoUrl)) {
        return reply
          .status(400)
          .send({ error: 'Invalid GitHub repository URL.' });
      }

      const normalizedUrl = normalizeRepoUrl(repoUrl);

      try {
        const dbRepository = await prisma.repository.findUnique({
          where: { url: normalizedUrl },
        });

        if (!dbRepository) {
          return reply.status(404).send({
            error: 'Repository not found.',
          });
        }

        // Allow retry for failed repositories
        if (dbRepository.state !== 'failed') {
          return reply.status(400).send({
            error: `Repository cannot be retried. Current state: ${dbRepository.state}`,
          });
        }

        // Get token from authenticated user session, or fall back to Authorization header, or use env token
        let token: string | null = null;
        const userToken = await getUserToken(request);
        if (userToken) {
          token = userToken;
        } else if (authorization) {
          token = authorization.replace('Bearer ', '');
        }

        // Reset repository state to pending and update lastAttempt
        await prisma.repository.update({
          where: { id: dbRepository.id },
          data: {
            state: 'pending',
            lastAttempt: new Date(),
          },
        });

        // Re-add to commit queue
        await enqueueCommitJob(
          dbRepository.id,
          dbRepository.url,
          dbRepository.pathName,
          token
        );

        return reply.status(200).send({
          message: 'Repository queued for retry.',
          repository: {
            id: dbRepository.id,
            url: dbRepository.url,
            state: 'pending',
          },
        });
      } catch (error) {
        logger.error('Error retrying repository:', error);
        return reply
          .status(500)
          .send({ error: 'Failed to retry repository processing.' });
      }
    });

    // Hook to disconnect Prisma when the server shuts down
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });

    // Start listening
    await app.listen({
      port: Number(process.env.PORT) || 3000,
      host: '0.0.0.0',
    });
    logger.info(
      `Server is running on http://0.0.0.0:${process.env.PORT || 3000}`
    );
  } catch (err) {
    logger.error('Error starting server:', err);
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
