#!/usr/bin/env node
/**
 * Comprehensive diagnostic script for pending repositories
 * Checks:
 * 1. Repository states in database
 * 2. Commit queue status
 * 3. User queue status
 * 4. Whether pending repos have jobs in commit queue
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { commitQueue, userQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function checkJobExists(repositoryId: number): Promise<boolean> {
  try {
    const jobId = `commit-${repositoryId}`;
    const job = await commitQueue.getJob(jobId);
    return job !== null;
  } catch (error: any) {
    logger.warn(`Error checking job for repo ${repositoryId}: ${error.message}`);
    return false;
  }
}

async function diagnosePendingRepos() {
  try {
    logger.info('🔍 Diagnosing Pending Repositories...\n');

    // Step 1: Check repository states
    logger.info('📊 Step 1: Checking Repository States');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const allRepos = await prisma.repository.findMany({
      select: {
        id: true,
        url: true,
        state: true,
        createdAt: true,
        lastAttempt: true,
        lastProcessedAt: true,
        commitsProcessedAt: true,
        usersProcessedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const stateCounts: Record<string, number> = {};
    allRepos.forEach((repo) => {
      stateCounts[repo.state] = (stateCounts[repo.state] || 0) + 1;
    });

    Object.entries(stateCounts).forEach(([state, count]) => {
      logger.info(`   ${state}: ${count}`);
    });
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 2: Check commit queue
    logger.info('📊 Step 2: Checking Commit Queue');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let commitWaiting: any[] = [];
    let commitActive: any[] = [];
    let commitFailed: any[] = [];
    
    try {
      commitWaiting = await commitQueue.getWaiting();
      commitActive = await commitQueue.getActive();
      commitFailed = await commitQueue.getFailed();
    } catch (error: any) {
      logger.warn(`   ⚠️  Could not connect to commit queue: ${error.message}`);
      logger.info('   Continuing with database checks only...\n');
    }

    logger.info(`   Waiting: ${commitWaiting.length}`);
    logger.info(`   Active: ${commitActive.length}`);
    logger.info(`   Failed: ${commitFailed.length}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 3: Check user queue
    logger.info('📊 Step 3: Checking User Queue');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let userWaiting: any[] = [];
    let userActive: any[] = [];
    let userFailed: any[] = [];
    
    try {
      userWaiting = await userQueue.getWaiting();
      userActive = await userQueue.getActive();
      userFailed = await userQueue.getFailed();
    } catch (error: any) {
      logger.warn(`   ⚠️  Could not connect to user queue: ${error.message}`);
      logger.info('   Continuing with database checks only...\n');
    }

    logger.info(`   Waiting: ${userWaiting.length}`);
    logger.info(`   Active: ${userActive.length}`);
    logger.info(`   Failed: ${userFailed.length}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 4: Find pending repositories and check if they have jobs
    logger.info('📊 Step 4: Analyzing Pending Repositories');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const pendingRepos = allRepos.filter((repo) => repo.state === 'pending');
    
    // Declare these outside the if/else block so they're accessible in the summary
    const reposWithJobs: typeof pendingRepos = [];
    const reposWithoutJobs: typeof pendingRepos = [];
    
    if (pendingRepos.length === 0) {
      logger.info('   ✅ No pending repositories found!\n');
    } else {
      logger.info(`   Found ${pendingRepos.length} pending repository(ies):\n`);
      
      for (const repo of pendingRepos) {
        const hasJob = await checkJobExists(repo.id);
        if (hasJob) {
          reposWithJobs.push(repo);
        } else {
          reposWithoutJobs.push(repo);
        }
      }

      if (reposWithJobs.length > 0) {
        logger.info(`   ✅ ${reposWithJobs.length} pending repo(s) have jobs in queue:`);
        reposWithJobs.forEach((repo) => {
          logger.info(`      - ID ${repo.id}: ${repo.url}`);
          logger.info(`        Created: ${repo.createdAt.toISOString()}`);
          logger.info(`        Last Attempt: ${repo.lastAttempt?.toISOString() || 'Never'}`);
        });
        logger.info('');
      }

      if (reposWithoutJobs.length > 0) {
        logger.info(`   ⚠️  ${reposWithoutJobs.length} pending repo(s) WITHOUT jobs in queue:`);
        reposWithoutJobs.forEach((repo) => {
          logger.info(`      - ID ${repo.id}: ${repo.url}`);
          logger.info(`        Created: ${repo.createdAt.toISOString()}`);
          logger.info(`        Last Attempt: ${repo.lastAttempt?.toISOString() || 'Never'}`);
          logger.info(`        ⚠️  This repository needs to be re-enqueued!`);
        });
        logger.info('');
      }

      // Check if any pending repos are in the waiting queue
      const pendingRepoIds = new Set(pendingRepos.map((r) => r.id));
      const waitingRepoIds = new Set(
        commitWaiting.map((job) => job.data.repositoryId)
      );

      const pendingInQueue = pendingRepos.filter((repo) =>
        waitingRepoIds.has(repo.id)
      );

      if (pendingInQueue.length > 0) {
        logger.info(`   📋 ${pendingInQueue.length} pending repo(s) found in waiting queue:`);
        pendingInQueue.forEach((repo) => {
          const job = commitWaiting.find(
            (j) => j.data.repositoryId === repo.id
          );
          logger.info(`      - ID ${repo.id}: ${repo.url}`);
          logger.info(`        Job ID: ${job?.id || 'N/A'}`);
          logger.info(`        Job Created: ${job?.timestamp ? new Date(job.timestamp).toISOString() : 'N/A'}`);
        });
        logger.info('');
      }
    }

    // Step 5: Check for other problematic states
    logger.info('📊 Step 5: Checking Other States');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const commitsProcessing = allRepos.filter(
      (repo) => repo.state === 'commits_processing'
    );
    const usersProcessing = allRepos.filter(
      (repo) => repo.state === 'users_processing'
    );
    const failed = allRepos.filter((repo) => repo.state === 'failed');

    if (commitsProcessing.length > 0) {
      logger.info(`   🔄 ${commitsProcessing.length} repo(s) in commits_processing:`);
      commitsProcessing.slice(0, 5).forEach((repo) => {
        logger.info(`      - ID ${repo.id}: ${repo.url}`);
        logger.info(`        Last Attempt: ${repo.lastAttempt?.toISOString() || 'Never'}`);
      });
      if (commitsProcessing.length > 5) {
        logger.info(`      ... and ${commitsProcessing.length - 5} more`);
      }
      logger.info('');
    }

    if (usersProcessing.length > 0) {
      logger.info(`   🔄 ${usersProcessing.length} repo(s) in users_processing:`);
      usersProcessing.slice(0, 5).forEach((repo) => {
        logger.info(`      - ID ${repo.id}: ${repo.url}`);
        logger.info(`        Commits Processed: ${repo.commitsProcessedAt?.toISOString() || 'Never'}`);
      });
      if (usersProcessing.length > 5) {
        logger.info(`      ... and ${usersProcessing.length - 5} more`);
      }
      logger.info('');
    }

    if (failed.length > 0) {
      logger.info(`   ❌ ${failed.length} repo(s) in failed state:`);
      failed.slice(0, 5).forEach((repo) => {
        logger.info(`      - ID ${repo.id}: ${repo.url}`);
        logger.info(`        Last Attempt: ${repo.lastAttempt?.toISOString() || 'Never'}`);
      });
      if (failed.length > 5) {
        logger.info(`      ... and ${failed.length - 5} more`);
      }
      logger.info('');
    }

    // Summary
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('📋 Summary:');
    logger.info(`   Total Repositories: ${allRepos.length}`);
    logger.info(`   Pending: ${pendingRepos.length}`);
    logger.info(`   Commits Processing: ${commitsProcessing.length}`);
    logger.info(`   Users Processing: ${usersProcessing.length}`);
    logger.info(`   Completed: ${stateCounts['completed'] || 0}`);
    logger.info(`   Failed: ${failed.length}`);
    
    if (reposWithoutJobs.length > 0) {
      logger.info('');
      logger.info('⚠️  ACTION REQUIRED:');
      logger.info(`   ${reposWithoutJobs.length} pending repository(ies) need to be re-enqueued.`);
      logger.info('   Run: npm run reenqueue-pending');
      logger.info('   Or use: ./reenqueue-pending-gcp.sh (for production)');
    }
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await prisma.$disconnect();
    try {
      await commitQueue.close();
      await userQueue.close();
    } catch (error: any) {
      // Ignore errors when closing
    }
    process.exit(0);
  } catch (error: any) {
    logger.error('Error diagnosing pending repos:', error.message);
    logger.error(error.stack);
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      await commitQueue.close();
      await userQueue.close();
    } catch {}
    process.exit(1);
  }
}

diagnosePendingRepos();

