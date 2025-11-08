/// <reference path="./types/fastify.d.ts" />
import fastify from 'fastify';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { repoQueue } from './services/queueService';
import { getLeaderboardForRepository } from './services/repoService';
import { isValidGitHubUrl } from './utils/isValidGitHubUrl';
import { normalizeRepoUrl } from './utils/normalizeUrl';
import { authRoutes } from './routes/auth';
import { getUserToken } from './utils/getUserToken';
import { populateDemoRepos } from './utils/populateDemoRepos';

dotenv.config();

const app = fastify({ logger: true });

// Start the server
const startServer = async () => {
  try {
    console.log('[SERVER] Starting server...');
    console.log('[SERVER] Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      FRONTEND_URL: process.env.FRONTEND_URL,
      BACKEND_URL: process.env.BACKEND_URL,
      SESSION_SECRET: process.env.SESSION_SECRET ? 'Set' : 'Missing',
      POPULATE_DEMO_REPOS: process.env.POPULATE_DEMO_REPOS || 'false',
    });

    // Populate demo repos if enabled
    if (process.env.POPULATE_DEMO_REPOS === 'true') {
      console.log('[SERVER] POPULATE_DEMO_REPOS is enabled, populating demo repositories...');
      try {
        await populateDemoRepos({ silent: false });
        console.log('[SERVER] Demo repositories population completed.');
      } catch (error) {
        console.error('[SERVER] Error populating demo repos:', error);
        // Don't fail server startup if demo population fails
      }
    }

    // Register CORS
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    console.log('[SERVER] Registering CORS for:', frontendUrl);
    await app.register(require('@fastify/cors'), {
      origin: frontendUrl,
      credentials: true,
    });
    console.log('[SERVER] CORS registered');

    // Register cookie plugin
    console.log('[SERVER] Registering cookie plugin');
    await app.register(require('@fastify/cookie'));
    console.log('[SERVER] Cookie plugin registered');

    // Register session plugin
    console.log('[SERVER] Registering session plugin');
    await app.register(require('@fastify/session'), {
      cookieName: 'sessionId',
      secret: process.env.SESSION_SECRET || 'a-very-long-random-string-change-in-production',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        sameSite: 'lax',
      },
    });
    console.log('[SERVER] Session plugin registered');

    // Register auth routes
    console.log('[SERVER] Registering auth routes');
    await app.register(authRoutes);
    console.log('[SERVER] Auth routes registered');

    // Register routes
    app.get('/health', async (request, reply) => {
      return reply.status(200).send({ message: 'Server is running.' });
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
        return reply.status(400).send({ error: 'Invalid GitHub repository URL.' });
      }

      const normalizedUrl = normalizeRepoUrl(repoUrl);
      try {
        let dbRepository = await prisma.repository.findUnique({
          where: { url: normalizedUrl },
        });

        if (!dbRepository) {
          const repoName =
            normalizedUrl.split('/').pop()?.replace('.git', '') || 'default_repo';
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
          
          await repoQueue.add({ dbRepository, token });
        }

        switch (dbRepository.state) {
          case 'pending':
          case 'in_progress':
            return reply
              .status(202)
              .send({ message: 'Repository is being processed.' });
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
        return reply.status(400).send({ error: 'Invalid GitHub repository URL.' });
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
            error: 'Repository not found, remember to submit for processing first.',
          });
        }

        switch (dbRepository.state) {
          case 'in_progress':
          case 'pending':
            return reply
              .status(202)
              .send({ message: 'Repository still processing.' });
          case 'completed':
            const leaderboard = await getLeaderboardForRepository(dbRepository);
            return reply.status(200).send(leaderboard);
          default:
            return reply
              .status(404)
              .send({ error: 'Repository processing status unknown.' });
        }
      } catch (error) {
        console.error('Error in /leaderboard:', error);
        return reply.status(500).send({ error: 'Failed to return leaderboard.' });
      }
    });

    app.get('/repositories', async (req, reply) => {
      try {
        const repositories = await prisma.repository.findMany();
        return reply.status(200).send(repositories);
      } catch (error) {
        console.error('Failed to fetch repository jobs:', error);
        reply.status(500).send({ error: 'Failed to fetch repository jobs' });
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
    console.log(
      `Server is running on http://0.0.0.0:${process.env.PORT || 3000}`
    );
  } catch (err) {
    console.error('Error starting server:', err);
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
