#!/usr/bin/env node
/**
 * Queue Diagnostic Script
 * Checks the state of jobs in the Bull queue
 */

import { repoQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function checkQueueStatus() {
  try {
    logger.info('🔍 Checking Queue Status...\n');

    // Check different job states
    const waiting = await repoQueue.getWaiting();
    const active = await repoQueue.getActive();
    const completed = await repoQueue.getCompleted();
    const failed = await repoQueue.getFailed();
    const delayed = await repoQueue.getDelayed();

    logger.info('📊 Queue Statistics:');
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
        logger.info(`      Repository: ${job.data.dbRepository?.url || 'N/A'}`);
        logger.info(`      State: ${job.data.dbRepository?.state || 'N/A'}`);
      });
      logger.info('');
    }

    // Show active jobs
    if (active.length > 0) {
      logger.info('🔄 Active Jobs:');
      active.forEach((job, idx) => {
        logger.info(`   ${idx + 1}. Job ID: ${job.id}`);
        logger.info(`      Repository: ${job.data.dbRepository?.url || 'N/A'}`);
      });
      logger.info('');
    }

    // Show failed jobs
    if (failed.length > 0) {
      logger.info('❌ Failed Jobs (last 5):');
      failed.slice(0, 5).forEach((job, idx) => {
        logger.info(`   ${idx + 1}. Job ID: ${job.id}`);
        logger.info(`      Repository: ${job.data.dbRepository?.url || 'N/A'}`);
        logger.info(`      Error: ${job.failedReason || 'Unknown'}`);
      });
      logger.info('');
    }

    // Check database repository states
    logger.info('📦 Database Repository States:');
    const repos = await prisma.repository.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const stateCounts = repos.reduce(
      (acc, repo) => {
        acc[repo.state] = (acc[repo.state] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    logger.info('   State counts (last 10 repos):');
    Object.entries(stateCounts).forEach(([state, count]) => {
      logger.info(`      ${state}: ${count}`);
    });
    logger.info('');

    // Show repos stuck in pending/queued
    const stuckRepos = repos.filter(
      (repo) => repo.state === 'pending' || repo.state === 'queued'
    );
    if (stuckRepos.length > 0) {
      logger.info('⚠️  Repositories stuck in queue:');
      stuckRepos.forEach((repo) => {
        logger.info(
          `   - ${repo.url} (state: ${repo.state}, created: ${repo.createdAt})`
        );
      });
      logger.info('');
    }

    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error checking queue status:', error.message);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

checkQueueStatus();
