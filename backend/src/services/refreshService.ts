import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';
import { rateLimitHandler } from '../utils/rateLimitHandler';

/**
 * Refresh GitHub data for contributors that only have email addresses
 * This is used to fill in missing username and profileUrl data after rate limits reset
 */
export const refreshContributorData = async (
  githubToken: string | null = null
): Promise<{
  refreshed: number;
  failed: number;
  skipped: number;
  rateLimitHit: boolean;
}> => {
  const token = githubToken || process.env.GITHUB_TOKEN;
  if (!token || token === 'your_token_optional') {
    logger.warn('[REFRESH] No valid GitHub token available for refresh');
    return { refreshed: 0, failed: 0, skipped: 0, rateLimitHit: false };
  }

  // Find contributors that have email but no username/profileUrl
  // These are likely contributors created during rate limit hits
  const contributorsToRefresh = await prisma.contributor.findMany({
    where: {
      email: { not: null },
      OR: [
        { username: null },
        { profileUrl: null },
      ],
    },
  });

  logger.info(
    `[REFRESH] Found ${contributorsToRefresh.length} contributors to refresh`
  );

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  let rateLimitHit = false;

  for (const contributor of contributorsToRefresh) {
    if (!contributor.email) {
      skipped++;
      continue;
    }

    // Skip no-reply emails (we can't look them up by email)
    if (contributor.email.endsWith('@users.noreply.github.com')) {
      skipped++;
      continue;
    }

    try {
      // Check rate limits before making the request
      await rateLimitHandler.checkAndWait();
      
      const response = await axios.get(
        `https://api.github.com/search/users?q=${contributor.email}+in:email`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update rate limit state from response
      rateLimitHandler.updateFromResponse(response);

      if (response.data.items.length > 0) {
        const { login, html_url } = response.data.items[0];

        await prisma.contributor.update({
          where: { id: contributor.id },
          data: {
            username: login,
            profileUrl: html_url,
            updatedAt: new Date(),
          },
        });

        refreshed++;
        logger.debug(
          `[REFRESH] Refreshed contributor ${contributor.email} -> ${login}`
        );
      } else {
        // User not found on GitHub (private email or not a GitHub user)
        skipped++;
        logger.debug(
          `[REFRESH] No GitHub user found for email: ${contributor.email}`
        );
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;

      if (rateLimitHandler.isRateLimitError(error)) {
        rateLimitHit = true;
        logger.warn(
          `[REFRESH] Rate limit hit while refreshing ${contributor.email}. Stopping refresh process.`
        );
        // Update rate limit state from error response if available
        if (error.response) {
          rateLimitHandler.updateFromResponse(error.response);
        }
        break; // Stop refreshing if we hit rate limit
      } else {
        failed++;
        logger.error(
          `[REFRESH] Failed to refresh contributor ${contributor.email}: ${errorMessage}`
        );
      }
    }
  }

  logger.info(
    `[REFRESH] Refresh complete: ${refreshed} refreshed, ${failed} failed, ${skipped} skipped`
  );

  return { refreshed, failed, skipped, rateLimitHit };
};

/**
 * Refresh contributors for repositories marked as completed_partial
 * This fills in missing GitHub data for those repositories
 */
export const refreshPartialRepositories = async (
  githubToken: string | null = null
): Promise<{
  repositoriesProcessed: number;
  contributorsRefreshed: number;
  rateLimitHit: boolean;
}> => {
  // Find repositories that were completed partially
  const partialRepositories = await prisma.repository.findMany({
    where: {
      state: 'completed_partial',
    },
  });

  logger.info(
    `[REFRESH] Found ${partialRepositories.length} partial repositories to refresh`
  );

  if (partialRepositories.length === 0) {
    return {
      repositoriesProcessed: 0,
      contributorsRefreshed: 0,
      rateLimitHit: false,
    };
  }

  // Refresh all contributors (not just those in partial repos, but it's more efficient)
  const { refreshed, rateLimitHit } = await refreshContributorData(
    githubToken
  );

  // Update repository states if refresh was successful (no rate limit hit)
  if (!rateLimitHit && refreshed > 0) {
    const repositoryIds = partialRepositories.map((repo) => repo.id);
    await prisma.repository.updateMany({
      where: {
        id: { in: repositoryIds },
      },
      data: {
        state: 'completed',
        updatedAt: new Date(),
      },
    });

    logger.info(
      `[REFRESH] Updated ${repositoryIds.length} repositories from completed_partial to completed`
    );
  }

  return {
    repositoriesProcessed: partialRepositories.length,
    contributorsRefreshed: refreshed,
    rateLimitHit,
  };
};

