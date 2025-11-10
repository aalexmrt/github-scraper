#!/usr/bin/env node
/**
 * Commit Queue Diagnostic Script
 * Checks the state of jobs in the commit processing queue
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { commitQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function checkCommitQueueStatus() {
  try {
    logger.info('🔍 Checking Commit Queue Status...\n');

    // Wait for queue to be ready
    try {
      await commitQueue.getWaiting();
    } catch (error: any) {
      logger.error('Failed to connect to Redis queue:', error.message);
      logger.info('This might be a connection issue. Checking database states only...\n');
      // Continue with database checks only
    }

    // Check different job states
    let waiting: any[] = [];
    let active: any[] = [];
    let completed: any[] = [];
    let failed: any[] = [];
    let delayed: any[] = [];

    try {
      waiting = await commitQueue.getWaiting();
      active = await commitQueue.getActive();
      completed = await commitQueue.getCompleted();
      failed = await commitQueue.getFailed();
      delayed = await commitQueue.getDelayed();
    } catch (error: any) {
      logger.warn('Could not fetch queue stats (Redis connection issue):', error.message);
      logger.info('Showing database states only...\n');
    }

    logger.info('📊 Commit Queue Statistics:');
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
        logger.info(`      URL: ${job.data.url || 'N/A'}`);
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
        logger.info(`      URL: ${job.data.url || 'N/A'}`);
        logger.info(`      Started: ${job.processedOn ? new Date(job.processedOn).toISOString() : 'N/A'}`);
      });
      logger.info('');
    }

    // Show failed jobs
    if (failed.length > 0) {
      logger.info('❌ Failed Jobs (last 10):');
      failed.slice(0, 10).forEach((job, idx) => {
        logger.info(`   ${idx + 1}. Job ID: ${job.id}`);
        logger.info(`      Repository ID: ${job.data.repositoryId || 'N/A'}`);
        logger.info(`      URL: ${job.data.url || 'N/A'}`);
        logger.info(`      Error: ${job.failedReason || 'Unknown'}`);
        logger.info(`      Failed at: ${job.finishedOn ? new Date(job.finishedOn).toISOString() : 'N/A'}`);
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

    // Show repos stuck in pending
    const pendingRepos = repos.filter((repo) => repo.state === 'pending');
    if (pendingRepos.length > 0) {
      logger.info('⚠️  Repositories stuck in pending:');
      pendingRepos.forEach((repo) => {
        logger.info(
          `   - ID ${repo.id}: ${repo.url} (created: ${repo.createdAt.toISOString()}, lastAttempt: ${repo.lastAttempt?.toISOString() || 'N/A'})`
        );
      });
      logger.info('');
    }

    // Show repos in commits_processing (might be stuck)
    const processingRepos = repos.filter((repo) => repo.state === 'commits_processing');
    if (processingRepos.length > 0) {
      logger.info('🔄 Repositories currently processing commits:');
      processingRepos.forEach((repo) => {
        logger.info(
          `   - ID ${repo.id}: ${repo.url} (lastAttempt: ${repo.lastAttempt?.toISOString() || 'N/A'})`
        );
      });
      logger.info('');
    }

    // Show failed repos
    const failedRepos = repos.filter((repo) => repo.state === 'failed');
    if (failedRepos.length > 0) {
      logger.info('❌ Failed Repositories (last 5):');
      failedRepos.slice(0, 5).forEach((repo) => {
        logger.info(
          `   - ID ${repo.id}: ${repo.url} (lastAttempt: ${repo.lastAttempt?.toISOString() || 'N/A'})`
        );
      });
      logger.info('');
    }

    await prisma.$disconnect();
    try {
      await commitQueue.close();
    } catch (error: any) {
      // Ignore errors when closing
    }
    process.exit(0);
  } catch (error: any) {
    logger.error('Error checking commit queue status:', error.message);
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

checkCommitQueueStatus();

