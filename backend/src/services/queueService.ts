import Queue from 'bull';

// Use environment variables for Redis connection
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || '6379');

// Export the queue instance
export const repoQueue = new Queue('repository-processing', {
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
});
