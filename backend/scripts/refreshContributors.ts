import { refreshPartialRepositories } from '../src/services/refreshService';
import prisma from '../src/utils/prisma';
import { logger } from '../src/utils/logger';

/**
 * Script to refresh contributor data for repositories marked as completed_partial
 * This fills in missing GitHub username and profileUrl data after rate limits reset
 *
 * Usage:
 *   npm run refresh-contributors
 *   or
 *   npx ts-node scripts/refreshContributors.ts
 */
async function main() {
  try {
    logger.info('[REFRESH] Starting contributor refresh...');

    // Get token from environment
    const token = process.env.GITHUB_TOKEN || null;
    if (!token || token === 'your_token_optional') {
      logger.warn(
        '[REFRESH] No valid GitHub token found. Set GITHUB_TOKEN environment variable.'
      );
      process.exit(1);
    }

    const result = await refreshPartialRepositories(token);

    logger.info('[REFRESH] Refresh summary:', {
      repositoriesProcessed: result.repositoriesProcessed,
      contributorsRefreshed: result.contributorsRefreshed,
      rateLimitHit: result.rateLimitHit,
    });

    if (result.rateLimitHit) {
      logger.warn(
        '[REFRESH] Refresh hit rate limit. Run again later to complete refresh.'
      );
      process.exit(1);
    }

    logger.info('[REFRESH] Refresh completed successfully!');
    process.exit(0);
  } catch (error: any) {
    logger.error('[REFRESH] Error during refresh:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();







