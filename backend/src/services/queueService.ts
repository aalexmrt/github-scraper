import Queue from 'bull';

// Use environment variables for Redis connection
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_TLS = process.env.REDIS_TLS === 'true';

// Build Redis configuration with proper retry/timeout settings
// For local Redis (no TLS/password), use more lenient settings
// For Upstash (TLS/password), use stricter timeout settings
const isLocalRedis = !REDIS_TLS && !REDIS_PASSWORD;

const redisConfig: any = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  // Connection retry settings
  maxRetriesPerRequest: isLocalRedis ? null : 3, // null = unlimited retries for local
  retryStrategy: (times: number) => {
    if (isLocalRedis) {
      // For local Redis, retry more aggressively
      if (times > 10) {
        return null; // Stop retrying after 10 attempts
      }
      return Math.min(times * 100, 1000); // Up to 1 second between retries
    }
    // For Upstash, use shorter retries
    if (times > 3) {
      return null; // Stop retrying after 3 attempts
    }
    return Math.min(times * 50, 200);
  },
  // Connection timeout settings
  connectTimeout: isLocalRedis ? 20000 : 10000, // 20 seconds for local, 10 for Upstash
  commandTimeout: isLocalRedis ? 10000 : 5000, // 10 seconds for local, 5 for Upstash
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

// Export the commit queue instance (for clone and commit processing)
export const commitQueue = new Queue('commit-processing', {
  redis: redisConfig,
  // Queue-level settings
  settings: {
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
});

// Export the user queue instance (for user API lookups)
export const userQueue = new Queue('user-processing', {
  redis: redisConfig,
  // Queue-level settings
  settings: {
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
});

// Legacy queue (kept for backward compatibility during migration)
export const repoQueue = new Queue('repository-processing', {
  redis: redisConfig,
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1,
  },
});

// Helper function to add commit processing job
// Uses repositoryId as jobId to prevent duplicate jobs for the same repository
export async function enqueueCommitJob(
  repositoryId: number,
  url: string,
  pathName: string,
  token: string | null
) {
  const jobId = `commit-${repositoryId}`;
  
  return commitQueue.add(
    'commit_processing',
    {
      repositoryId,
      url,
      pathName,
      token,
    },
    {
      jobId, // Unique ID per repository - prevents duplicates
      removeOnComplete: true, // Clean up completed jobs
      removeOnFail: false, // Keep failed jobs for debugging
      attempts: 3, // Retry failed jobs up to 3 times
      backoff: {
        type: 'exponential',
        delay: 60000, // Start with 1 minute delay
      },
    }
  );
}

// Helper function to create a simple hash from an array of strings
// Used to create unique job IDs for user jobs based on email batches
function hashEmails(emails: string[]): string {
  const str = emails.sort().join(',');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36); // Convert to base36 string
}

// Helper function to add user processing job
// Uses repositoryId + email batch hash as jobId to prevent duplicate jobs for the same batch
export async function enqueueUserJob(
  repositoryId: number,
  emails: string[],
  token: string | null
) {
  // Create a unique ID based on repository and email batch
  // This ensures the same batch of emails isn't processed twice
  const batchHash = hashEmails(emails);
  const jobId = `user-${repositoryId}-${batchHash}`;
  
  return userQueue.add(
    'user_processing',
    {
      repositoryId,
      emails,
      token,
    },
    {
      jobId, // Unique ID per repository + batch - prevents duplicates
      removeOnComplete: true, // Clean up completed jobs
      removeOnFail: false, // Keep failed jobs for debugging
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // Start with 1 minute
      },
    }
  );
}

// Add error handlers for debugging
const queues = [commitQueue, userQueue, repoQueue];

queues.forEach((queue) => {
  queue.on('error', (error) => {
    console.error(
      `[QUEUE:${queue.name}] Redis connection error:`,
      error.message
    );
  });

  // Listen for connection close events
  queue.on('close', () => {
    console.warn(`[QUEUE:${queue.name}] Redis connection closed`);
  });

  queue.on('waiting', (jobId) => {
    console.log(`[QUEUE:${queue.name}] Job ${jobId} is waiting`);
  });

  queue.on('active', (job) => {
    console.log(`[QUEUE:${queue.name}] Job ${job.id} is now active`);
  });

  queue.on('failed', (job, err) => {
    console.error(`[QUEUE:${queue.name}] Job ${job?.id} failed:`, err.message);
  });

  queue.on('completed', (job) => {
    console.log(`[QUEUE:${queue.name}] Job ${job.id} completed`);
  });
});

/**
 * Check if a commit job already exists for a repository
 * Returns true if a job exists in waiting, active, or delayed state
 */
export async function commitJobExists(
  repositoryId: number
): Promise<boolean> {
  try {
    const jobId = `commit-${repositoryId}`;
    const job = await commitQueue.getJob(jobId);
    if (!job) {
      return false;
    }
    // Check if job is in a processable state (not completed or failed)
    const state = await job.getState();
    return ['waiting', 'active', 'delayed'].includes(state);
  } catch (error: any) {
    // If job doesn't exist, getJob throws an error
    // This is expected behavior, so return false
    return false;
  }
}

/**
 * Wait for a queue's Redis connection to be ready
 * This is important for Cloud Run environments where connections may take time to establish
 */
export async function waitForQueueReady(
  queue: typeof commitQueue | typeof userQueue | typeof repoQueue,
  maxRetries: number = 10,
  retryDelayMs: number = 1000
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try a simple operation to check if connection is ready
      await queue.getWaiting();
      return; // Connection is ready
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to establish Redis connection after ${maxRetries} attempts: ${error.message}`
        );
      }
      console.log(
        `[QUEUE:${queue.name}] Connection not ready (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
