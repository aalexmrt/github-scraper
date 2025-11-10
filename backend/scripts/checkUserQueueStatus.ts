#!/usr/bin/env node
/**
 * User Queue Diagnostic Script
 * Checks the state of jobs in the user processing queue
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { userQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function checkUserQueueStatus() {
  try {
    logger.info('🔍 Checking User Queue Status...\n');

    // Wait for queue to be ready
    try {
      await userQueue.getWaiting();
    } catch (error: any) {
      logger.error('Failed to connect to Redis queue:', error.message);
      logger.info(
        'This might be a connection issue. Checking database states only...\n'
      );
      // Continue with database checks only
    }

    // Check different job states
    let waiting: any[] = [];
    let active: any[] = [];
    let completed: any[] = [];
    let failed: any[] = [];
    let delayed: any[] = [];

    try {
      waiting = await userQueue.getWaiting();
      active = await userQueue.getActive();
      completed = await userQueue.getCompleted();
      failed = await userQueue.getFailed();
      delayed = await userQueue.getDelayed();
    } catch (error: any) {
      logger.warn(
        'Could not fetch queue stats (Redis connection issue):',
        error.message
      );
      logger.info('Showing database states only...\n');
    }

    logger.info('📊 User Queue Statistics:');
    logger.info(`   Waiting: ${waiting.length}`);
    logger.info(`   Active: ${active.length}`);
    logger.info(`   Completed: ${completed.length}`);
    logger.info(`   Failed: ${failed.length}`);
    logger.info(`   Delayed: ${delayed.length}`);
    logger.info('');

    // Show waiting jobs details
    if (waiting.length > 0) {
      logger.info('⏳ Waiting Jobs:');
      waiting.forEach((job, idx) => {
        logger.info(`   ${idx + 1}. Job ID: ${job.id}`);
        logger.info(`      Repository ID: ${job.data.repositoryId || 'N/A'}`);
        logger.info(`      Emails: ${job.data.emails?.length || 0} emails`);
        logger.info(`      Created: ${new Date(job.timestamp).toISOString()}`);
      });
      logger.info('');
    }

    // Show active jobs
    if (active.length > 0) {
      logger.info('🔄 Active Jobs:');
      active.forEach((job, idx) => {
        logger.info(`   ${idx + 1}. Job ID: ${job.id}`);
        logger.info(`      Repository ID: ${job.data.repositoryId || 'N/A'}`);
        logger.info(`      Emails: ${job.data.emails?.length || 0} emails`);
        logger.info(
          `      Started: ${job.processedOn ? new Date(job.processedOn).toISOString() : 'N/A'}`
        );
      });
      logger.info('');
    }

    // Show failed jobs
    if (failed.length > 0) {
      logger.info('❌ Failed Jobs (last 10):');
      failed.slice(0, 10).forEach((job, idx) => {
        logger.info(`   ${idx + 1}. Job ID: ${job.id}`);
        logger.info(`      Repository ID: ${job.data.repositoryId || 'N/A'}`);
        logger.info(`      Emails: ${job.data.emails?.length || 0} emails`);
        logger.info(`      Error: ${job.failedReason || 'Unknown'}`);
        logger.info(
          `      Failed at: ${job.finishedOn ? new Date(job.finishedOn).toISOString() : 'N/A'}`
        );
      });
      logger.info('');
    }

    // Check database repository states
    logger.info('📦 Database Repository States:');
    const repos = await prisma.repository.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const stateCounts = repos.reduce(
      (acc, repo) => {
        acc[repo.state] = (acc[repo.state] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    logger.info('   State counts (last 20 repos):');
    Object.entries(stateCounts).forEach(([state, count]) => {
      logger.info(`      ${state}: ${count}`);
    });
    logger.info('');

    // Show repos in users_processing state
    const processingRepos = repos.filter(
      (repo) => repo.state === 'users_processing'
    );
    if (processingRepos.length > 0) {
      logger.info('🔄 Repositories currently processing users:');
      processingRepos.forEach((repo) => {
        logger.info(
          `   - ID ${repo.id}: ${repo.url} (lastAttempt: ${repo.lastAttempt?.toISOString() || 'N/A'})`
        );
      });
      logger.info('');
    }

    // Check CommitData for unprocessed records
    const unprocessedCommits = await prisma.commitData.count({
      where: {
        processed: false,
      },
    });

    if (unprocessedCommits > 0) {
      logger.info(`⚠️  Unprocessed CommitData records: ${unprocessedCommits}`);
      logger.info('   These need user processing to enrich contributor data');
      logger.info('');
    }

    // Show repos that have commits processed but users not processed
    const reposWithUnprocessedCommits = await prisma.repository.findMany({
      where: {
        commitsProcessedAt: { not: null },
        state: { in: ['users_processing', 'completed'] },
      },
      include: {
        _count: {
          select: {
            commitData: {
              where: {
                processed: false,
              },
            },
          },
        },
      },
      take: 10,
    });

    const reposNeedingProcessing = reposWithUnprocessedCommits.filter(
      (repo) => repo._count.commitData > 0
    );

    if (reposNeedingProcessing.length > 0) {
      logger.info('📧 Repositories with unprocessed user data:');
      reposNeedingProcessing.forEach((repo) => {
        logger.info(
          `   - ID ${repo.id}: ${repo.url} (${repo._count.commitData} unprocessed commits)`
        );
      });
      logger.info('');
    }

    await prisma.$disconnect();
    try {
      await userQueue.close();
    } catch (error: any) {
      // Ignore errors when closing
    }
    process.exit(0);
  } catch (error: any) {
    logger.error('Error checking user queue status:', error.message);
    logger.error(error.stack);
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      await userQueue.close();
    } catch {}
    process.exit(1);
  }
}

checkUserQueueStatus();
