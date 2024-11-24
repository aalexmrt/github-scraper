import Queue from 'bull';
import { processRepository } from './repoService';

// Use environment variables for Redis connection
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || '6379');

export const repoQueue = new Queue('repository-processing', {
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
});

// Define the job processor
repoQueue.process(async (job) => {
  const { repoUrl } = job.data;
  console.log(`Processing repository: ${repoUrl}`);
  const message = await processRepository(repoUrl);
  console.log(`Repository processed: ${message}`);
});
