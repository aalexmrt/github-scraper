import { repoQueue } from '../services/queueService';
import { syncRepository, generateLeaderboard } from '../services/repoService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

/**
 * Cloud Run Jobs-compatible worker
 * Processes ONE job from the queue and exits (no continuous polling)
 */
async function processOneJob() {
  try {
    // First, check for stuck active jobs (jobs that were interrupted)
    // These can happen if a previous execution crashed
    const activeJobs = await repoQueue.getActive();
    if (activeJobs.length > 0) {
      logger.warn(
        `[WORKER] Found ${activeJobs.length} stuck active job(s), cleaning up...`
      );
      for (const job of activeJobs) {
        try {
          // For stuck active jobs, remove them - they'll be re-queued if needed
          // based on repository state in the database
          await job.remove();
          logger.info(
            `[WORKER] Removed stuck active job ${job.id} (repository: ${job.data.dbRepository?.url || 'N/A'})`
          );
        } catch (error: any) {
          logger.error(
            `[WORKER] Failed to remove stuck job ${job.id}: ${error.message}`
          );
          // If removal fails due to lock, try to update the repository state
          // so it can be re-queued later
          try {
            const repoId = job.data.dbRepository?.id;
            if (repoId) {
              await prisma.repository.update({
                where: { id: repoId },
                data: { state: 'pending' },
              });
              logger.info(
                `[WORKER] Reset repository ${repoId} to pending state`
              );
            }
          } catch (dbError: any) {
            logger.error(
              `[WORKER] Failed to reset repository state: ${dbError.message}`
            );
          }
        }
      }
    }

    // Get waiting jobs from the queue
    const waitingJobs = await repoQueue.getWaiting();

    if (waitingJobs.length === 0) {
      logger.info('[WORKER] No jobs in queue, exiting gracefully');
      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(0);
    }

    // Process the first waiting job
    const job = waitingJobs[0];
    logger.info(
      `[WORKER] Processing job ${job.id} for repository: ${job.data.dbRepository.url}`
    );

    const { dbRepository, token = null } = job.data;

    try {
      await prisma.repository.update({
        where: { id: dbRepository.id },
        data: { state: 'in_progress', lastAttempt: new Date() },
      });

      await syncRepository(dbRepository, token);
      await generateLeaderboard(dbRepository);

      // Update repository state - always completed since we don't make API calls
      await prisma.repository.update({
        where: { id: dbRepository.id },
        data: {
          state: 'completed',
          lastProcessedAt: new Date(),
        },
      });

      logger.info(
        `[WORKER] Repository ${dbRepository.url} processed successfully. Contributors created with email-only data (no API calls made).`
      );

      await job.remove(); // Remove completed job from queue
      logger.info(
        `[WORKER] Successfully processed repository ${dbRepository.url}`
      );

      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(0);
    } catch (error: any) {
      await prisma.repository.update({
        where: { id: dbRepository.id },
        data: { state: 'failed' },
      });

      logger.error(
        `[WORKER] Failed to process repository ${dbRepository.url}: ${error.message}`
      );

      // Move job to failed state (Bull will handle retries if configured)
      await job.moveToFailed(error as Error);

      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(1);
    }
  } catch (error: any) {
    logger.error('[WORKER] Error getting job from queue:', error.message);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

// Run migrations first, then process one job
async function main() {
  try {
    const version = getVersion();
    console.log('[WORKER] Starting Cloud Run worker...');
    console.log(`[WORKER] Worker Version: ${version}`);

    logger.info('[WORKER] Running database migrations...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('[WORKER] Migrations completed');

    logger.info('[WORKER] Starting job processing...');
    await processOneJob();
  } catch (error: any) {
    logger.error('[WORKER] Fatal error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
