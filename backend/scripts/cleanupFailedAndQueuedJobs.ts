#!/usr/bin/env node
/**
 * Clean up failed and queued jobs from production
 * Removes all failed and waiting jobs from the Bull queue
 */

import { repoQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function cleanupFailedAndQueuedJobs() {
  try {
    logger.info('🧹 Cleaning up failed and queued jobs from production...\n');

    // Get all job states
    const waiting = await repoQueue.getWaiting();
    const failed = await repoQueue.getFailed();
    const active = await repoQueue.getActive();
    const completed = await repoQueue.getCompleted();
    const delayed = await repoQueue.getDelayed();

    logger.info('📊 Current Queue Status:');
    logger.info(`   Waiting: ${waiting.length}`);
    logger.info(`   Failed: ${failed.length}`);
    logger.info(`   Active: ${active.length}`);
    logger.info(`   Completed: ${completed.length}`);
    logger.info(`   Delayed: ${delayed.length}\n`);

    let removedCount = 0;

    // Remove all failed jobs
    if (failed.length > 0) {
      logger.info(`🗑️  Removing ${failed.length} failed job(s)...`);
      for (const job of failed) {
        try {
          const repoUrl = job.data.dbRepository?.url || 'N/A';
          logger.info(`   Removing failed job ${job.id} (${repoUrl})`);
          await job.remove();
          removedCount++;
          logger.info(`   ✅ Removed failed job ${job.id}`);
        } catch (error: any) {
          logger.error(`   ❌ Failed to remove job ${job.id}: ${error.message}`);
        }
      }
      logger.info('');
    }

    // Remove all waiting/queued jobs
    if (waiting.length > 0) {
      logger.info(`🗑️  Removing ${waiting.length} queued/waiting job(s)...`);
      for (const job of waiting) {
        try {
          const repoUrl = job.data.dbRepository?.url || 'N/A';
          const repoId = job.data.dbRepository?.id;
          logger.info(`   Removing queued job ${job.id} (${repoUrl})`);
          
          // Remove from queue
          await job.remove();
          removedCount++;
          logger.info(`   ✅ Removed queued job ${job.id}`);
          
          // Optionally reset repository state to 'pending' so it can be re-queued if needed
          if (repoId) {
            try {
              await prisma.repository.update({
                where: { id: repoId },
                data: { state: 'pending' },
              });
              logger.info(`   ✅ Reset repository ${repoId} to pending state`);
            } catch (dbError: any) {
              logger.warn(`   ⚠️  Could not update repository state: ${dbError.message}`);
            }
          }
        } catch (error: any) {
          logger.error(`   ❌ Failed to remove job ${job.id}: ${error.message}`);
        }
      }
      logger.info('');
    }

    // Remove delayed jobs if any
    if (delayed.length > 0) {
      logger.info(`🗑️  Removing ${delayed.length} delayed job(s)...`);
      for (const job of delayed) {
        try {
          const repoUrl = job.data.dbRepository?.url || 'N/A';
          logger.info(`   Removing delayed job ${job.id} (${repoUrl})`);
          await job.remove();
          removedCount++;
          logger.info(`   ✅ Removed delayed job ${job.id}`);
        } catch (error: any) {
          logger.error(`   ❌ Failed to remove job ${job.id}: ${error.message}`);
        }
      }
      logger.info('');
    }

    // Warn about active jobs (don't remove these automatically)
    if (active.length > 0) {
      logger.warn(`⚠️  Found ${active.length} active job(s) - these are currently being processed`);
      logger.warn('   Active jobs are not removed automatically. Use cleanupStuckJobs.ts if needed.\n');
    }

    logger.info(`✅ Queue cleanup complete! Removed ${removedCount} job(s) total.\n`);

    // Clean up repositories from database
    logger.info('🗄️  Cleaning up repositories from database...\n');
    
    // Find repositories with failed, queued, or pending state
    // Note: 'pending' is the actual state used for repositories waiting to be processed
    const failedRepos = await prisma.repository.findMany({
      where: {
        state: { in: ['failed', 'queued', 'pending'] },
      },
    });

    logger.info(`📊 Found ${failedRepos.length} repository/repositories with failed/queued/pending state\n`);

    let deletedReposCount = 0;

    if (failedRepos.length > 0) {
      logger.info(`🗑️  Deleting ${failedRepos.length} repository/repositories...`);
      
      for (const repo of failedRepos) {
        try {
          logger.info(`   Deleting repository ${repo.id} (${repo.url})`);
          
          // First, delete RepositoryContributor records (due to foreign key constraint)
          const deletedContributors = await prisma.repositoryContributor.deleteMany({
            where: { repositoryId: repo.id },
          });
          
          if (deletedContributors.count > 0) {
            logger.info(`   ✅ Deleted ${deletedContributors.count} contributor relationship(s)`);
          }
          
          // Then delete the repository
          await prisma.repository.delete({
            where: { id: repo.id },
          });
          
          deletedReposCount++;
          logger.info(`   ✅ Deleted repository ${repo.id}`);
        } catch (error: any) {
          logger.error(`   ❌ Failed to delete repository ${repo.id}: ${error.message}`);
        }
      }
      logger.info('');
    } else {
      logger.info('✅ No repositories with failed/queued state found in database\n');
    }

    logger.info(`✅ Database cleanup complete! Deleted ${deletedReposCount} repository/repositories.\n`);

    // Show final status
    const finalWaiting = await repoQueue.getWaiting();
    const finalFailed = await repoQueue.getFailed();
    const finalDelayed = await repoQueue.getDelayed();

    logger.info('📊 Final Queue Status:');
    logger.info(`   Waiting: ${finalWaiting.length}`);
    logger.info(`   Failed: ${finalFailed.length}`);
    logger.info(`   Delayed: ${finalDelayed.length}`);

    // Show final database status
    const finalFailedRepos = await prisma.repository.count({
      where: {
        state: { in: ['failed', 'queued', 'pending'] },
      },
    });

    logger.info('\n📊 Final Database Status:');
    logger.info(`   Failed/Queued/Pending repositories: ${finalFailedRepos}`);

    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error cleaning up jobs:', error.message);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

cleanupFailedAndQueuedJobs();

