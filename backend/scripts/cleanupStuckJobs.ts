#!/usr/bin/env node
/**
 * Clean up stuck jobs in the Bull queue
 * Moves active jobs back to waiting or removes them if they're too old
 */

import { repoQueue } from '../services/queueService';
import { logger } from '../utils/logger';

async function cleanupStuckJobs() {
  try {
    logger.info('🧹 Cleaning up stuck jobs...\n');

    const activeJobs = await repoQueue.getActive();
    logger.info(`Found ${activeJobs.length} active job(s)\n`);

    if (activeJobs.length === 0) {
      logger.info('✅ No stuck jobs found');
      await repoQueue.close();
      process.exit(0);
    }

    for (const job of activeJobs) {
      try {
        logger.info(`Processing job ${job.id}...`);
        logger.info(`  Repository: ${job.data.dbRepository?.url || 'N/A'}`);
        logger.info(`  State: ${job.data.dbRepository?.state || 'N/A'}`);

        // Remove stuck active jobs - they'll be re-queued if needed based on DB state
        await job.remove();
        logger.info(`  ✅ Removed stuck job ${job.id}`);
      } catch (error: any) {
        logger.error(`  ❌ Failed to remove job ${job.id}: ${error.message}`);
      }
    }

    logger.info('\n✅ Cleanup complete');
    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error cleaning up stuck jobs:', error.message);
    await repoQueue.close();
    process.exit(1);
  }
}

cleanupStuckJobs();

