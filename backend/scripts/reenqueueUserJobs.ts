#!/usr/bin/env node
/**
 * Re-enqueue User Jobs for Repositories in users_processing State
 * Finds repositories with unprocessed CommitData and re-enqueues user jobs
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { userQueue, enqueueUserJob, waitForQueueReady } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function reenqueueUserJobs() {
  try {
    logger.info('🔍 Finding repositories in users_processing state with unprocessed commits...\n');

    // Find all repositories in users_processing state
    const processingRepos = await prisma.repository.findMany({
      where: {
        state: 'users_processing',
      },
      orderBy: {
        commitsProcessedAt: 'desc',
      },
    });

    if (processingRepos.length === 0) {
      logger.info('✅ No repositories in users_processing state found.');
      await prisma.$disconnect();
      try {
        await userQueue.close();
      } catch {}
      process.exit(0);
    }

    logger.info(`📊 Found ${processingRepos.length} repository/repositories in users_processing state:\n`);

    // Wait for Redis connection to be ready
    logger.info('⏳ Waiting for Redis connection...');
    try {
      await waitForQueueReady(userQueue, 10, 2000);
      logger.info('✅ Redis connection ready\n');
    } catch (error: any) {
      logger.error(`❌ Failed to connect to Redis: ${error.message}`);
      logger.error('Please check your Redis configuration and try again.');
      await prisma.$disconnect();
      process.exit(1);
    }

    let totalEnqueued = 0;
    let reposProcessed = 0;
    let reposSkipped = 0;

    for (const repo of processingRepos) {
      try {
        logger.info(`🔄 Checking repository ${repo.id}: ${repo.url}`);
        
        // Get unprocessed CommitData for this repository
        const unprocessedCommits = await prisma.commitData.findMany({
          where: {
            repositoryId: repo.id,
            processed: false,
          },
          select: {
            authorEmail: true,
          },
          distinct: ['authorEmail'],
        });

        if (unprocessedCommits.length === 0) {
          logger.info(`   ✅ All commits processed for repository ${repo.id}, marking as completed...`);
          
          // Update repository state to completed
          await prisma.repository.update({
            where: { id: repo.id },
            data: {
              state: 'completed',
              usersProcessedAt: new Date(),
              lastProcessedAt: new Date(),
            },
          });
          
          reposSkipped++;
          logger.info(`   ✅ Repository ${repo.id} marked as completed\n`);
          continue;
        }

        logger.info(`   📧 Found ${unprocessedCommits.length} unprocessed email(s)`);

        // Get GitHub token (if available)
        const token = process.env.GITHUB_TOKEN || null;

        // Batch emails (50 per job, same as commit worker)
        const BATCH_SIZE = 50;
        const emails = unprocessedCommits.map((c) => c.authorEmail);
        const batches: string[][] = [];

        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
          batches.push(emails.slice(i, i + BATCH_SIZE));
        }

        logger.info(`   📦 Creating ${batches.length} user job(s) for ${emails.length} email(s)...`);

        // Enqueue user jobs
        let enqueuedForRepo = 0;
        for (const batch of batches) {
          try {
            await enqueueUserJob(repo.id, batch, token);
            enqueuedForRepo++;
          } catch (error: any) {
            logger.error(`   ❌ Failed to enqueue batch: ${error.message}`);
          }
        }

        if (enqueuedForRepo > 0) {
          totalEnqueued += enqueuedForRepo;
          reposProcessed++;
          logger.info(`   ✅ Enqueued ${enqueuedForRepo} job(s) for repository ${repo.id}\n`);
        } else {
          logger.warn(`   ⚠️  No jobs enqueued for repository ${repo.id}\n`);
        }
      } catch (error: any) {
        logger.error(`   ❌ Error processing repository ${repo.id}: ${error.message}\n`);
      }
    }

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('📋 Summary:');
    logger.info(`   Repositories processed: ${reposProcessed}`);
    logger.info(`   Repositories skipped (already completed): ${reposSkipped}`);
    logger.info(`   Total jobs enqueued: ${totalEnqueued}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await prisma.$disconnect();
    try {
      await userQueue.close();
    } catch (error: any) {
      // Ignore errors when closing
    }
    process.exit(0);
  } catch (error: any) {
    logger.error(`❌ Error: ${error.message}`);
    logger.error(error.stack);
    await prisma.$disconnect();
    try {
      await userQueue.close();
    } catch {}
    process.exit(1);
  }
}

reenqueueUserJobs();

