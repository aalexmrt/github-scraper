import fastify from 'fastify';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { repoQueue } from './services/queueService';
import { isValidGitHubUrl } from './services/repoService';
dotenv.config();

const app = fastify();

app.get('/health', async (request, reply) => {
  return reply.status(200).send({ message: 'Server is running.' });
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

  try {
    // Check if a job is already in progress
    // Check if a job is already in progress
    const jobs = await repoQueue.getJobs(['waiting', 'active']);
    const existingJob = jobs.find((job) => job.data.repoUrl === repoUrl);

    if (existingJob) {
      return reply
        .status(202)
        .send({ message: 'Repository is being processed.' });
    }

    // Check if the job is completed
    const completedJobs = await repoQueue.getJobs(['completed']);
    const completedJob = completedJobs.find(
      (job) => job.data.repoUrl === repoUrl
    );

    if (completedJob) {
      return reply.status(200).send({
        leaderboard: completedJob.returnvalue, // Fetch result
      });
    }

    // Add a new job for processing
    await repoQueue.add({ repoUrl });
    console.log('Job added to queue:', repoUrl);
    return reply
      .status(202)
      .send({ message: 'Repository is being processed.' });
  } catch (error) {
    console.error('Error in /leaderboard:', error);
    return reply
      .status(500)
      .send({ error: 'Failed to process the leaderboard request.' });
  }
});

app.get('/repositories/jobs', async (req, reply) => {
  try {
    // Fetch jobs that are waiting or actively being processed
    const waitingJobs = await repoQueue.getJobs(['waiting']);
    const activeJobs = await repoQueue.getJobs(['active']);
    const completedJobs = await repoQueue.getJobs(['completed']);

    // Combine and map the jobs to relevant data
    const jobs = await Promise.all(
      [...waitingJobs, ...activeJobs, ...completedJobs].map(async (job) => ({
        id: job.id,
        repoUrl: job.data.repoUrl,
        status: await job.getState(),
      }))
    );

    await reply.send(jobs);
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
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server is running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
