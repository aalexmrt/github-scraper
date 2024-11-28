import fastify from 'fastify';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { repoQueue } from './services/queueService';
import { getLeaderboardForRepository } from './services/repoService';
import { isValidGitHubUrl } from './utils/isValidGitHubUrl';
import { normalizeRepoUrl } from './utils/normalizeUrl';

dotenv.config();

const app = fastify();

app.get('/health', async (request, reply) => {
  return reply.status(200).send({ message: 'Server is running.' });
});

app.post('/leaderboard', async (request, reply) => {
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
      await repoQueue.add({ dbRepository });
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

// Start the server
const startServer = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT) || 3000,
      host: process.env.BACKEND_URL || '0.0.0.0',
    });
    console.log(
      `Server is running on http://${process.env.BACKEND_URL || 'localhost'}:${process.env.PORT || 3000}`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
