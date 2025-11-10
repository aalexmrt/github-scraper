import { commitQueue } from '../services/queueService';
import '../workers/commit-worker'; // Import to register the processor
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

/**
 * Cloud Run Jobs-compatible commit worker
 * Processes ONE commit job from the queue and exits (no continuous polling)
 */
async function processOneCommitJob() {
  try {
    // First, check for stuck active jobs (jobs that were interrupted)
    const activeJobs = await commitQueue.getActive();
    if (activeJobs.length > 0) {
      logger.warn(
        `[COMMIT_WORKER] Found ${activeJobs.length} stuck active job(s), cleaning up...`
      );
      for (const job of activeJobs) {
        try {
          await job.remove();
          logger.info(
            `[COMMIT_WORKER] Removed stuck active job ${job.id} (repository: ${job.data.url || 'N/A'})`
          );
        } catch (error: any) {
          logger.error(
            `[COMMIT_WORKER] Failed to remove stuck job ${job.id}: ${error.message}`
          );
          // Try to update repository state
          try {
            const repoId = job.data.repositoryId;
            if (repoId) {
              await prisma.repository.update({
                where: { id: repoId },
                data: { state: 'pending' },
              });
              logger.info(
                `[COMMIT_WORKER] Reset repository ${repoId} to pending state`
              );
            }
          } catch (dbError: any) {
            logger.error(
              `[COMMIT_WORKER] Failed to reset repository state: ${dbError.message}`
            );
          }
        }
      }
    }

    // Get waiting jobs from the queue
    const waitingJobs = await commitQueue.getWaiting();

    if (waitingJobs.length === 0) {
      logger.info('[COMMIT_WORKER] No jobs in queue, exiting gracefully');
      await prisma.$disconnect();
      await commitQueue.close();
      process.exit(0);
    }

    // Process the first waiting job
    const job = waitingJobs[0];
    logger.info(
      `[COMMIT_WORKER] Processing job ${job.id} for repository: ${job.data.url}`
    );

    // The job will be processed by the commitQueue.process handler
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
    logger.info(`[COMMIT_WORKER] Successfully processed job ${job.id}`);

    await prisma.$disconnect();
    await commitQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('[COMMIT_WORKER] Error processing job:', error.message);
    await prisma.$disconnect();
    await commitQueue.close();
    process.exit(1);
  }
}

// Run migrations first, then process one job
async function main() {
  try {
    const version = getVersion();
    console.log('[COMMIT_WORKER] Starting Cloud Run commit worker...');
    console.log(`[COMMIT_WORKER] Worker Version: ${version}`);

    logger.info('[COMMIT_WORKER] Running database migrations...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('[COMMIT_WORKER] Migrations completed');

    logger.info('[COMMIT_WORKER] Starting job processing...');
    await processOneCommitJob();
  } catch (error: any) {
    logger.error('[COMMIT_WORKER] Fatal error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
