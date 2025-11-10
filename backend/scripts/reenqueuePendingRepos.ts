#!/usr/bin/env node
/**
 * Re-enqueue Pending Repositories Script
 * Finds repositories stuck in 'pending' state and re-enqueues them
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import {
  commitQueue,
  enqueueCommitJob,
  waitForQueueReady,
  commitJobExists,
} from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function reenqueuePendingRepos() {
  try {
    logger.info('🔍 Finding pending repositories...\n');

    // Find all repositories in pending state
    const pendingRepos = await prisma.repository.findMany({
      where: {
        state: 'pending',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (pendingRepos.length === 0) {
      logger.info('✅ No pending repositories found. All repositories are processed!');
      await prisma.$disconnect();
      try {
        await commitQueue.close();
      } catch {}
      process.exit(0);
    }

    logger.info(`📊 Found ${pendingRepos.length} pending repository/repositories:\n`);

    // Wait for Redis connection to be ready
    logger.info('⏳ Waiting for Redis connection...');
    try {
      await waitForQueueReady(commitQueue, 10, 2000);
      logger.info('✅ Redis connection ready\n');
    } catch (error: any) {
      logger.error(`❌ Failed to connect to Redis: ${error.message}`);
      logger.error('Please check your Redis configuration and try again.');
      await prisma.$disconnect();
      process.exit(1);
    }

    // Check queue status first
    try {
      const waiting = await commitQueue.getWaiting();
      logger.info(`📋 Current queue status: ${waiting.length} job(s) waiting\n`);
    } catch (error: any) {
      logger.warn(`⚠️  Could not check queue status: ${error.message}\n`);
    }

    let enqueuedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const repo of pendingRepos) {
      try {
        logger.info(`🔄 Checking repository ${repo.id}: ${repo.url}`);
        
        // Check if a job already exists for this repository
        const jobExists = await commitJobExists(repo.id);
        if (jobExists) {
          skippedCount++;
          logger.info(
            `   ⏭️  Job already exists for repository ${repo.id}, skipping...\n`
          );
          // Still update lastAttempt to show we checked
          await prisma.repository.update({
            where: { id: repo.id },
            data: {
              lastAttempt: new Date(),
            },
          });
          continue;
        }

        // Re-enqueue the job (deduplication will prevent duplicates)
        const job = await enqueueCommitJob(
          repo.id,
          repo.url,
          repo.pathName,
          null // No token - will use env token if available
        );

        if (!job) {
          throw new Error('Job creation returned null/undefined');
        }

        // Update lastAttempt timestamp
        await prisma.repository.update({
          where: { id: repo.id },
          data: {
            lastAttempt: new Date(),
          },
        });

        enqueuedCount++;
        logger.info(`   ✅ Successfully enqueued repository ${repo.id} (Job ID: ${job.id})\n`);
      } catch (error: any) {
        errorCount++;
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        logger.error(`   ❌ Failed to enqueue repository ${repo.id}: ${errorMsg}`);
        if (error?.stack) {
          logger.error(`   Stack: ${error.stack}`);
        }
        logger.error('');
      }
    }

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`✅ Re-enqueue complete!`);
    logger.info(`   Successfully enqueued: ${enqueuedCount}`);
    logger.info(`   Skipped (already queued): ${skippedCount}`);
    logger.info(`   Errors: ${errorCount}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Show final queue status
    try {
      const finalWaiting = await commitQueue.getWaiting();
      logger.info(`📋 Final queue status: ${finalWaiting.length} job(s) waiting`);
    } catch (error: any) {
      logger.warn(`⚠️  Could not check final queue status: ${error.message}`);
    }

    await prisma.$disconnect();
    try {
      await commitQueue.close();
    } catch (error: any) {
      // Ignore close errors
    }
    process.exit(0);
  } catch (error: any) {
    logger.error('Error re-enqueueing pending repositories:', error.message);
    logger.error(error.stack);
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      await commitQueue.close();
    } catch {}
    process.exit(1);
  }
}

reenqueuePendingRepos().catch((error) => {
  logger.error('Unhandled error in reenqueuePendingRepos:', error);
  process.exit(1);
});

