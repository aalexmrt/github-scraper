import fastify from 'fastify';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { processRepository, generateLeaderboard } from './services/repoService';
import { repoQueue } from './services/queueService';
dotenv.config();

const app = fastify();

app.get('/leaderboard', async (request, reply) => {
  const { repoUrl } = request.query as { repoUrl?: string };

  if (!repoUrl) {
    return reply.status(400).send({ error: 'repoUrl query parameter is required' });
  }

  // Check if a job is already in progress
  const jobs = await repoQueue.getJobs(['waiting', 'active']);
  const existingJob = jobs.find((job) => job.data.repoUrl === repoUrl);

  if (existingJob) {
    return reply.status(202).send({ message: 'Repository is being processed.' });
  }

  // Check if the job is completed
  const completedJobs = await repoQueue.getJobs(['completed']);
  const completedJob = completedJobs.find((job) => job.data.repoUrl === repoUrl);

  if (completedJob) {
    return reply.status(200).send({
      leaderboard: completedJob.returnvalue, // Fetch result
    });
  }

    // Add a new job for processing
    await repoQueue.add({ repoUrl });
    return reply.status(202).send({ message: 'Repository is being processed.' });


     
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
