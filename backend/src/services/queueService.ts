import Queue from 'bull';

// Use environment variables for Redis connection
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_TLS = process.env.REDIS_TLS === 'true';

// Build Redis configuration
const redisConfig: any = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

// Add password if provided (required for Upstash)
if (REDIS_PASSWORD) {
  redisConfig.password = REDIS_PASSWORD;
}

// Add TLS configuration if required (Upstash requires TLS)
if (REDIS_TLS) {
  redisConfig.tls = {};
}

// Export the queue instance
export const repoQueue = new Queue('repository-processing', {
  redis: redisConfig,
});
