#!/usr/bin/env node
/**
 * Cleanup Duplicate Jobs Script
 * Removes duplicate commit jobs from both commitQueue and legacy repoQueue
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import {
  commitQueue,
  repoQueue,
  waitForQueueReady,
} from '../src/services/queueService';
import { logger } from '../src/utils/logger';

interface JobInfo {
  id: string | number;
  repositoryId: number;
  url: string;
  timestamp: number;
}

async function cleanupQueue(queue: typeof commitQueue, queueName: string) {
  logger.info(`\n📦 Cleaning ${queueName}...`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get all jobs from the queue
  logger.info(`📋 Fetching all jobs from ${queueName}...`);
  const waitingJobs = await queue.getWaiting();
  const activeJobs = await queue.getActive();
  const delayedJobs = await queue.getDelayed();
  const failedJobs = await queue.getFailed();

  logger.info(`   Waiting: ${waitingJobs.length}`);
  logger.info(`   Active: ${activeJobs.length}`);
  logger.info(`   Delayed: ${delayedJobs.length}`);
  logger.info(`   Failed: ${failedJobs.length}`);

  const allJobs = [
    ...waitingJobs,
    ...activeJobs,
    ...delayedJobs,
    ...failedJobs,
  ];

  logger.info(`   Found ${allJobs.length} total job(s) in queue\n`);

  if (allJobs.length === 0) {
    logger.info(`✅ No jobs found in ${queueName}. Queue is clean!`);
    return { removed: 0, errors: 0 };
  }

  // Group jobs by repositoryId (or URL as fallback)
  logger.info('🔍 Analyzing jobs for duplicates...');
  const jobsByRepo = new Map<number, JobInfo[]>();
  const jobsByUrl = new Map<string, JobInfo[]>();
  let skippedJobs = 0;

  for (const job of allJobs) {
    // Handle different job data structures
    // commitQueue: job.data.repositoryId, job.data.url
    // repoQueue: job.data.dbRepository?.id, job.data.dbRepository?.url
    let repositoryId: number | undefined;
    let url: string;

    if (job.data?.repositoryId) {
      // commitQueue format
      repositoryId = job.data.repositoryId;
      url = job.data.url || 'unknown';
    } else if (job.data?.dbRepository?.id) {
      // repoQueue format
      repositoryId = job.data.dbRepository.id;
      url = job.data.dbRepository.url || 'unknown';
    } else {
      // Fallback: try to extract URL from any field
      url = job.data?.url || job.data?.dbRepository?.url || 'unknown';
      repositoryId = undefined;
    }

    if (!repositoryId) {
      // Fallback: group by URL if no repositoryId
      if (!jobsByUrl.has(url)) {
        jobsByUrl.set(url, []);
      }
      const jobInfo: JobInfo = {
        id: job.id,
        repositoryId: -1, // Mark as unknown
        url,
        timestamp: job.timestamp || Date.now(),
      };
      jobsByUrl.get(url)!.push(jobInfo);
      skippedJobs++;
      continue;
    }

    if (!jobsByRepo.has(repositoryId)) {
      jobsByRepo.set(repositoryId, []);
    }

    const jobInfo: JobInfo = {
      id: job.id,
      repositoryId,
      url,
      timestamp: job.timestamp || Date.now(),
    };

    jobsByRepo.get(repositoryId)!.push(jobInfo);
  }

  logger.info(`   Found jobs for ${jobsByRepo.size} unique repository/repositories`);
  if (jobsByUrl.size > 0) {
    logger.info(`   Found ${jobsByUrl.size} URL(s) with jobs missing repositoryId`);
  }
  if (skippedJobs > 0) {
    logger.info(`   ⚠️  ${skippedJobs} job(s) skipped (no repositoryId)`);
  }
  logger.info('');

  // Find duplicates by repositoryId
  const duplicates: Array<{ repoId: number; url: string; jobs: JobInfo[] }> =
    [];
  let totalDuplicates = 0;

  for (const [repoId, jobs] of jobsByRepo.entries()) {
    if (jobs.length > 1) {
      duplicates.push({
        repoId,
        url: jobs[0].url,
        jobs: jobs.sort((a, b) => a.timestamp - b.timestamp), // Sort by timestamp (oldest first)
      });
      totalDuplicates += jobs.length - 1; // All except one are duplicates
    }
  }

  // Also check duplicates by URL (for jobs without repositoryId)
  for (const [url, jobs] of jobsByUrl.entries()) {
    if (jobs.length > 1) {
      duplicates.push({
        repoId: -1, // Unknown repositoryId
        url,
        jobs: jobs.sort((a, b) => a.timestamp - b.timestamp),
      });
      totalDuplicates += jobs.length - 1;
    }
  }

  if (duplicates.length === 0) {
    logger.info(`✅ No duplicate jobs found in ${queueName}. Queue is clean!`);
    return { removed: 0, errors: 0 };
  }

  logger.info(
    `📊 Found ${duplicates.length} repository/repositories with duplicates:`
  );
  logger.info(`   Total duplicate jobs to remove: ${totalDuplicates}\n`);

  // Show what will be cleaned
  for (const dup of duplicates) {
    const repoLabel =
      dup.repoId === -1 ? 'Unknown ID' : `Repository ${dup.repoId}`;
    logger.info(`   ${repoLabel} (${dup.url}): ${dup.jobs.length} job(s)`);
    logger.info(`      Keeping: Job ${dup.jobs[0].id} (oldest)`);
    logger.info(
      `      Removing: ${dup.jobs.slice(1).map((j) => `Job ${j.id}`).join(', ')}`
    );
  }

  logger.info('\n');

  // Remove duplicate jobs
  logger.info('🗑️  Removing duplicate jobs...\n');

  let removedCount = 0;
  let errorCount = 0;

  for (const dup of duplicates) {
    // Keep the first job (oldest), remove the rest
    const jobsToRemove = dup.jobs.slice(1);

    for (const jobInfo of jobsToRemove) {
      try {
        const job = await queue.getJob(jobInfo.id);
        if (job) {
          await job.remove();
          removedCount++;
          logger.info(
            `   ✅ Removed duplicate job ${jobInfo.id} for ${dup.repoId === -1 ? `URL ${dup.url}` : `repository ${dup.repoId}`}`
          );
        } else {
          logger.warn(
            `   ⚠️  Job ${jobInfo.id} not found (may have been processed already)`
          );
        }
      } catch (error: any) {
        errorCount++;
        logger.error(`   ❌ Failed to remove job ${jobInfo.id}: ${error.message}`);
      }
    }
  }

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`✅ ${queueName} cleanup complete!`);
  logger.info(`   Removed: ${removedCount} duplicate job(s)`);
  logger.info(`   Errors: ${errorCount}`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Show final queue status
  try {
    const finalWaiting = await queue.getWaiting();
    const finalActive = await queue.getActive();
    logger.info(
      `📋 Final ${queueName} status: ${finalWaiting.length} waiting, ${finalActive.length} active`
    );
  } catch (error: any) {
    logger.warn(`⚠️  Could not check final queue status: ${error.message}`);
  }

  return { removed: removedCount, errors: errorCount };
}

async function cleanupDuplicateJobs() {
  try {
    logger.info('🧹 Starting duplicate job cleanup...\n');

    // Wait for Redis connection to be ready
    logger.info('⏳ Waiting for Redis connection...');
    try {
      await waitForQueueReady(commitQueue, 10, 2000);
      logger.info('✅ Redis connection ready\n');
    } catch (error: any) {
      logger.error(`❌ Failed to connect to Redis: ${error.message}`);
      logger.error('Please check your Redis configuration and try again.');
      process.exit(1);
    }

    // Clean both queues
    const commitResult = await cleanupQueue(
      commitQueue,
      'commit-processing (commitQueue)'
    );
    const repoResult = await cleanupQueue(
      repoQueue,
      'repository-processing (legacy repoQueue)'
    );

    // Summary
    logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('📊 CLEANUP SUMMARY');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`   commitQueue: Removed ${commitResult.removed}, Errors ${commitResult.errors}`);
    logger.info(`   repoQueue: Removed ${repoResult.removed}, Errors ${repoResult.errors}`);
    logger.info(`   Total Removed: ${commitResult.removed + repoResult.removed}`);
    logger.info(`   Total Errors: ${commitResult.errors + repoResult.errors}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await commitQueue.close();
    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error cleaning up duplicate jobs:', error.message);
    logger.error(error.stack);
    try {
      await commitQueue.close();
    } catch {}
    try {
      await repoQueue.close();
    } catch {}
    process.exit(1);
  }
}

cleanupDuplicateJobs().catch((error) => {
  logger.error('Unhandled error in cleanupDuplicateJobs:', error);
  process.exit(1);
});
