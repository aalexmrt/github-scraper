import Queue from 'bull';

// Use environment variables for Redis connection
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_TLS = process.env.REDIS_TLS === 'true';

// Build Redis configuration with proper retry/timeout settings for Upstash
const redisConfig: any = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  // Connection retry settings
  maxRetriesPerRequest: 3, // Reduce retries to fail faster
  retryStrategy: (times: number) => {
    // Exponential backoff: 50ms, 100ms, 200ms, then give up
    if (times > 3) {
      return null; // Stop retrying after 3 attempts
    }
    return Math.min(times * 50, 200);
  },
  // Connection timeout settings
  connectTimeout: 10000, // 10 seconds
  commandTimeout: 5000, // 5 seconds per command
  lazyConnect: false, // Connect immediately
  // Keep-alive settings
  keepAlive: 30000, // 30 seconds
};

// Add password if provided (required for Upstash)
if (REDIS_PASSWORD) {
  redisConfig.password = REDIS_PASSWORD;
}

// Add TLS configuration if required (Upstash requires TLS)
if (REDIS_TLS) {
  redisConfig.tls = {
    rejectUnauthorized: true, // Verify certificate
  };
}

// Export the queue instance
export const repoQueue = new Queue('repository-processing', {
  redis: redisConfig,
  // Queue-level settings
  settings: {
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
});

// Add error handlers for debugging
repoQueue.on('error', (error) => {
  console.error('[QUEUE] Redis connection error:', error.message);
});

repoQueue.on('waiting', (jobId) => {
  console.log(`[QUEUE] Job ${jobId} is waiting`);
});

repoQueue.on('active', (job) => {
  console.log(`[QUEUE] Job ${job.id} is now active`);
});

repoQueue.on('failed', (job, err) => {
  console.error(`[QUEUE] Job ${job?.id} failed:`, err.message);
});

repoQueue.on('completed', (job) => {
  console.log(`[QUEUE] Job ${job.id} completed`);
});
