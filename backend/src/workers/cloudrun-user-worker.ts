import { userQueue } from '../services/queueService';
import '../workers/user-worker'; // Import to register the processor
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

/**
 * Cloud Run Jobs-compatible user worker
 * Processes ONE user job from the queue and exits (no continuous polling)
 */
async function processOneUserJob() {
  try {
    // First, check for stuck active jobs (jobs that were interrupted)
    const activeJobs = await userQueue.getActive();
    if (activeJobs.length > 0) {
      logger.warn(
        `[USER_WORKER] Found ${activeJobs.length} stuck active job(s), cleaning up...`
      );
      for (const job of activeJobs) {
        try {
          await job.remove();
          logger.info(
            `[USER_WORKER] Removed stuck active job ${job.id} (repository: ${job.data.repositoryId || 'N/A'})`
          );
        } catch (error: any) {
          logger.error(
            `[USER_WORKER] Failed to remove stuck job ${job.id}: ${error.message}`
          );
        }
      }
    }

    // Get waiting jobs from the queue
    const waitingJobs = await userQueue.getWaiting();

    if (waitingJobs.length === 0) {
      logger.info('[USER_WORKER] No jobs in queue, exiting gracefully');
      await prisma.$disconnect();
      await userQueue.close();
      process.exit(0);
    }

    // Process the first waiting job
    const job = waitingJobs[0];
    logger.info(
      `[USER_WORKER] Processing job ${job.id} for repository: ${job.data.repositoryId} (${job.data.emails.length} emails)`
    );

    // The job will be processed by the userQueue.process handler
    // We just need to wait for it to complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Job processing timeout'));
      }, 600000); // 10 minute timeout

      job
        .finished()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });

    await job.remove(); // Remove completed job from queue
    logger.info(`[USER_WORKER] Successfully processed job ${job.id}`);

    await prisma.$disconnect();
    await userQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('[USER_WORKER] Error processing job:', error.message);
    await prisma.$disconnect();
    await userQueue.close();
    process.exit(1);
  }
}

// Run migrations first, then process one job
async function main() {
  try {
    const version = getVersion();
    console.log('[USER_WORKER] Starting Cloud Run user worker...');
    console.log(`[USER_WORKER] Worker Version: ${version}`);

    logger.info('[USER_WORKER] Running database migrations...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('[USER_WORKER] Migrations completed');

    logger.info('[USER_WORKER] Starting job processing...');
    await processOneUserJob();
  } catch (error: any) {
    logger.error('[USER_WORKER] Fatal error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
