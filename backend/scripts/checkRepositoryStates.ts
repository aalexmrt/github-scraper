#!/usr/bin/env node
/**
 * Check repository states in production database
 * Shows what states repositories actually have
 */

import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

async function checkRepositoryStates() {
  try {
    logger.info('🔍 Checking repository states in production...\n');

    // Get all repositories grouped by state
    const repos = await prisma.repository.findMany({
      select: {
        id: true,
        url: true,
        state: true,
        createdAt: true,
        lastAttempt: true,
        lastProcessedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by state
    const stateCounts: Record<string, number> = {};
    const reposByState: Record<string, typeof repos> = {};

    repos.forEach((repo) => {
      const state = repo.state;
      stateCounts[state] = (stateCounts[state] || 0) + 1;
      if (!reposByState[state]) {
        reposByState[state] = [];
      }
      reposByState[state].push(repo);
    });

    logger.info('📊 Repository States Summary:');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    Object.entries(stateCounts).forEach(([state, count]) => {
      logger.info(`   ${state}: ${count}`);
    });
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Show details for each state
    Object.entries(reposByState).forEach(([state, stateRepos]) => {
      logger.info(`\n📋 Repositories with state "${state}" (${stateRepos.length}):`);
      stateRepos.slice(0, 10).forEach((repo) => {
        logger.info(`   - ID ${repo.id}: ${repo.url}`);
        logger.info(`     Created: ${repo.createdAt.toISOString()}`);
        if (repo.lastAttempt) {
          logger.info(`     Last Attempt: ${repo.lastAttempt.toISOString()}`);
        }
        if (repo.lastProcessedAt) {
          logger.info(`     Last Processed: ${repo.lastProcessedAt.toISOString()}`);
        }
      });
      if (stateRepos.length > 10) {
        logger.info(`   ... and ${stateRepos.length - 10} more`);
      }
    });

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error checking repository states:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkRepositoryStates();

