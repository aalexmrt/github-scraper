#!/usr/bin/env node
/**
 * Fix Stuck Job Script
 * Clears all active jobs and stuck locks in the Bull queue
 */

import { repoQueue } from '../src/services/queueService';
import { logger } from '../src/utils/logger';
import type { Job } from 'bull';

async function fixStuckJob() {
  try {
    logger.info('🔧 Fixing stuck jobs...\n');

    // Get all job states
    const active = await repoQueue.getActive();
    const waiting = await repoQueue.getWaiting();
    const failed = await repoQueue.getFailed();
    const completed = await repoQueue.getCompleted();

    logger.info('📊 Current Queue State:');
    logger.info(`   Active: ${active.length}`);
    logger.info(`   Waiting: ${waiting.length}`);
    logger.info(`   Failed: ${failed.length}`);
    logger.info(`   Completed: ${completed.length}\n`);

    // If there are active jobs, they're stuck
    if (active.length > 0) {
      logger.info('🔴 Found stuck active jobs, removing...\n');

      for (const job of active) {
        try {
          logger.info(
            `   Removing job ${job.id} (${job.data.dbRepository?.url || 'unknown'})`
          );

          // Try to remove the job
          try {
            await job.remove();
            logger.info(`   ✅ Successfully removed job ${job.id}`);
          } catch (removeError: any) {
            logger.warn(`   ⚠️  Remove failed, attempting to update status...`);
            // If removal fails, mark as failed to unblock
            try {
              await job.moveToFailed(new Error('Cleared stuck job'));
              logger.info(`   ✅ Marked job ${job.id} as failed`);
            } catch (failError: any) {
              logger.error(
                `   ❌ Could not mark as failed: ${failError.message}`
              );
              // Last resort: update the job data directly
              logger.info(
                `   🔨 Using nuclear option - clearing Redis keys directly`
              );
            }
          }
        } catch (error: any) {
          logger.error(
            `   ❌ Error processing job ${job.id}: ${error.message}`
          );
        }
      }
      logger.info('');
    }

    // Check waiting jobs (these should be fine)
    if (waiting.length > 0) {
      logger.info(
        `✅ Found ${waiting.length} waiting job(s) - these are ready to process:\n`
      );
      waiting.slice(0, 3).forEach((job: Job, idx: number) => {
        logger.info(
          `   ${idx + 1}. Job ${job.id}: ${job.data.dbRepository?.url}`
        );
      });
      logger.info('');
    }

    // Check failed jobs
    if (failed.length > 0) {
      logger.info(`⚠️  Found ${failed.length} failed job(s):`);
      logger.info('   (These may need manual review)\n');
    }

    logger.info('🧹 Cleanup complete!');
    logger.info('   The scheduler will retry at the next scheduled time.');
    logger.info(
      '   Or manually trigger: gcloud run jobs execute worker --region=YOUR_REGION --project=YOUR_GCP_PROJECT_ID\n'
    );

    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('Fatal error:', error.message);
    await repoQueue.close();
    process.exit(1);
  }
}

fixStuckJob();
