import axios from 'axios';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { rateLimitHandler } from '../utils/rateLimitHandler';

/**
 * Get or create a contributor from email
 * Makes GitHub API calls to enrich user data
 */
async function getOrCreateContributor(
  email: string,
  token: string | null
): Promise<any> {
  // Check if no-reply email
  const isNoReply = email.endsWith('@users.noreply.github.com');
  const username = isNoReply
    ? email.split('@')[0].split('+')[1] || email.split('@')[0]
    : null;

  // Check database first
  let contributor = await prisma.contributor.findFirst({
    where: {
      OR: [{ email }, ...(username ? [{ username }] : [])],
    },
  });

  if (contributor) {
    // Check if needs refresh (>24h old)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const needsRefresh =
      !isNoReply &&
      contributor.updatedAt.getTime() < Date.now() - TWENTY_FOUR_HOURS;

    if (needsRefresh && token) {
      try {
        await rateLimitHandler.checkAndWait();
        const response = await axios.get(
          `https://api.github.com/search/users?q=${email}+in:email`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        rateLimitHandler.updateFromResponse(response);

        if (response.data.items.length > 0) {
          const { login, html_url } = response.data.items[0];
          contributor = await prisma.contributor.update({
            where: { id: contributor.id },
            data: {
              username: login,
              profileUrl: html_url,
              updatedAt: new Date(),
            },
          });
        }
      } catch (error: any) {
        // If rate limit or error, use existing contributor
        if (!rateLimitHandler.isRateLimitError(error)) {
          logger.warn(`Failed to refresh ${email}: ${error.message}`);
        }
      }
    }

    return contributor;
  }

  // Create new contributor
  if (isNoReply) {
    return prisma.contributor.create({
      data: {
        username,
        profileUrl: `https://github.com/${username}`,
      },
    });
  }

  // Try to lookup via API
  if (token) {
    try {
      await rateLimitHandler.checkAndWait();
      const response = await axios.get(
        `https://api.github.com/search/users?q=${email}+in:email`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      rateLimitHandler.updateFromResponse(response);

      if (response.data.items.length > 0) {
        const { login, html_url } = response.data.items[0];
        return prisma.contributor.upsert({
          where: { username: login },
          update: { email, profileUrl: html_url },
          create: {
            username: login,
            email,
            profileUrl: html_url,
          },
        });
      }
    } catch (error: any) {
      if (rateLimitHandler.isRateLimitError(error)) {
        // Rate limit hit - create with email only
        logger.warn(
          `[USER_SERVICE] Rate limit hit for ${email}, creating with email only`
        );
        return prisma.contributor.create({
          data: { email },
        });
      }
      logger.error(`Failed to lookup ${email}: ${error.message}`);
    }
  }

  // Fallback: create with email only
  return prisma.contributor.create({
    data: { email },
  });
}

/**
 * Batch process user lookups for a repository
 * Processes emails in batches and links contributors to repository
 */
export async function batchProcessUsers(
  repositoryId: number,
  emails: string[],
  token: string | null
): Promise<{ processed: number; rateLimitHit: boolean }> {
  let processed = 0;
  let rateLimitHit = false;

  // Get commit data for these emails
  const commitData = await prisma.commitData.findMany({
    where: {
      repositoryId,
      authorEmail: { in: emails },
    },
  });

  logger.info(
    `[USER_SERVICE] Processing ${commitData.length} contributors for repository ${repositoryId}`
  );

  // Process each email
  for (const { authorEmail, commitCount } of commitData) {
    try {
      // Check rate limits before each request
      await rateLimitHandler.checkAndWait();

      // Get or create contributor
      const contributor = await getOrCreateContributor(authorEmail, token);

      // Link contributor to repository
      await prisma.repositoryContributor.upsert({
        where: {
          repositoryId_contributorId: {
            repositoryId,
            contributorId: contributor.id,
          },
        },
        update: { commitCount },
        create: {
          repositoryId,
          contributorId: contributor.id,
          commitCount,
        },
      });

      processed++;
    } catch (error: any) {
      if (rateLimitHandler.isRateLimitError(error)) {
        rateLimitHit = true;
        logger.warn(
          `[USER_SERVICE] Rate limit hit, stopping batch processing for repository ${repositoryId}`
        );
        // Update rate limit state from error response if available
        if (error.response) {
          rateLimitHandler.updateFromResponse(error.response);
        }
        break; // Stop processing this batch
      } else {
        logger.error(
          `[USER_SERVICE] Failed to process ${authorEmail}: ${error.message}`
        );
        // Continue with next email
      }
    }
  }

  logger.info(
    `[USER_SERVICE] Processed ${processed}/${commitData.length} contributors for repository ${repositoryId}`
  );

  return { processed, rateLimitHit };
}



