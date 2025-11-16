#!/usr/bin/env node
/**
 * Clean up queue - keep only specific repository
 * Removes all jobs except the one for the specified repository URL
 */

import dotenv from 'dotenv';
dotenv.config();

import { repoQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';
import { normalizeRepoUrl } from '../src/utils/normalizeUrl';

async function cleanupQueueKeepSpecificRepo() {
  const keepRepoUrl =
    process.argv[2] || 'https://github.com/aalexmrt/github-scraper';
  const normalizedKeepUrl = normalizeRepoUrl(keepRepoUrl);

  try {
    logger.info('🧹 Cleaning up queue - keeping only specific repository...');
    logger.info(`   Keeping: ${keepRepoUrl}\n`);

    // Get all job states
    const waiting = await repoQueue.getWaiting();
    const failed = await repoQueue.getFailed();
    const active = await repoQueue.getActive();
    const delayed = await repoQueue.getDelayed();

    logger.info('📊 Current Queue Status:');
    logger.info(`   Waiting: ${waiting.length}`);
    logger.info(`   Failed: ${failed.length}`);
    logger.info(`   Active: ${active.length}`);
    logger.info(`   Delayed: ${delayed.length}\n`);

    let removedCount = 0;
    let keptCount = 0;

    // Process all job types
    const allJobs = [
      ...waiting.map((j) => ({ job: j, type: 'waiting' })),
      ...failed.map((j) => ({ job: j, type: 'failed' })),
      ...delayed.map((j) => ({ job: j, type: 'delayed' })),
    ];

    for (const { job, type } of allJobs) {
      const repoUrl = job.data.dbRepository?.url || '';
      const normalizedJobUrl = normalizeRepoUrl(repoUrl);

      if (normalizedJobUrl === normalizedKeepUrl) {
        logger.info(`✅ Keeping ${type} job ${job.id} (${repoUrl})`);
        keptCount++;
      } else {
        try {
          logger.info(`🗑️  Removing ${type} job ${job.id} (${repoUrl})`);
          await job.remove();
          removedCount++;
        } catch (error: any) {
          logger.error(
            `   ❌ Failed to remove job ${job.id}: ${error.message}`
          );
        }
      }
    }

    // Warn about active jobs
    if (active.length > 0) {
      logger.warn(
        `⚠️  Found ${active.length} active job(s) - these are currently being processed`
      );
      for (const job of active) {
        const repoUrl = job.data.dbRepository?.url || '';
        const normalizedJobUrl = normalizeRepoUrl(repoUrl);
        if (normalizedJobUrl === normalizedKeepUrl) {
          logger.info(
            `   ✅ Active job ${job.id} is for the repository we want to keep`
          );
        } else {
          logger.warn(
            `   ⚠️  Active job ${job.id} (${repoUrl}) - cannot remove while active`
          );
        }
      }
    }

    logger.info(`\n✅ Queue cleanup complete!`);
    logger.info(`   Removed: ${removedCount} job(s)`);
    logger.info(`   Kept: ${keptCount} job(s)\n`);

    // Clean up repositories from database (except the one we want to keep)
    logger.info('🗄️  Cleaning up repositories from database...\n');

    const allRepos = await prisma.repository.findMany({
      orderBy: { createdAt: 'desc' },
    });

    let deletedReposCount = 0;

    for (const repo of allRepos) {
      const normalizedRepoUrl = normalizeRepoUrl(repo.url);

      if (normalizedRepoUrl === normalizedKeepUrl) {
        logger.info(`✅ Keeping repository ${repo.id} (${repo.url})`);
        // Reset to pending if needed so it can be re-processed
        if (repo.state !== 'pending' && repo.state !== 'in_progress') {
          await prisma.repository.update({
            where: { id: repo.id },
            data: { state: 'pending' },
          });
          logger.info(`   ✅ Reset repository state to pending`);
        }
      } else {
        // Only delete if it's in a state that indicates it's not needed
        if (
          repo.state === 'failed' ||
          repo.state === 'pending' ||
          repo.state === 'queued'
        ) {
          try {
            logger.info(`🗑️  Deleting repository ${repo.id} (${repo.url})`);

            // Delete RepositoryContributor records first
            await prisma.repositoryContributor.deleteMany({
              where: { repositoryId: repo.id },
            });

            // Delete the repository
            await prisma.repository.delete({
              where: { id: repo.id },
            });

            deletedReposCount++;
            logger.info(`   ✅ Deleted repository ${repo.id}`);
          } catch (error: any) {
            logger.error(
              `   ❌ Failed to delete repository ${repo.id}: ${error.message}`
            );
          }
        } else {
          logger.info(
            `⏭️  Skipping repository ${repo.id} (${repo.url}) - state: ${repo.state}`
          );
        }
      }
    }

    logger.info(
      `\n✅ Database cleanup complete! Deleted ${deletedReposCount} repository/repositories.\n`
    );

    // Show final status
    const finalWaiting = await repoQueue.getWaiting();
    const finalFailed = await repoQueue.getFailed();
    const finalDelayed = await repoQueue.getDelayed();

    logger.info('📊 Final Queue Status:');
    logger.info(`   Waiting: ${finalWaiting.length}`);
    logger.info(`   Failed: ${finalFailed.length}`);
    logger.info(`   Delayed: ${finalDelayed.length}`);

    // Show the repository we're keeping
    const keptRepo = await prisma.repository.findFirst({
      where: { url: normalizedKeepUrl },
    });

    if (keptRepo) {
      logger.info(`\n📦 Repository to test:`);
      logger.info(`   ID: ${keptRepo.id}`);
      logger.info(`   URL: ${keptRepo.url}`);
      logger.info(`   State: ${keptRepo.state}`);
    }

    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error cleaning up queue:', error.message);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

cleanupQueueKeepSpecificRepo();







