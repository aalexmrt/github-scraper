import simpleGit from 'simple-git';
import axios from 'axios';
import prisma from '../utils/prisma';
import { createStorageAdapter } from './storage/storageFactory';
import { logger } from '../utils/logger';
import { rateLimitHandler } from '../utils/rateLimitHandler';

export interface DbRepository {
  id: number;
  url: string;
  pathName: string;
  state: string;
  lastAttempt: Date;
  lastProcessedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Initialize storage adapter (filesystem for local, R2 for production)
const storage = createStorageAdapter();

export const syncRepository = async (
  dbRepository: DbRepository,
  token: string | null = null
): Promise<string> => {
  const repoPath = dbRepository.pathName;
  
  try {
    // Ensure storage is ready
    await storage.ensureDirectory();

    const authenticatedRepoUrl = dbRepository.url.replace(
      'https://github.com',
      `https://${token}@github.com`
    );

    const repoExists = await storage.exists(repoPath);

    if (repoExists) {
      // Repository exists, fetch updates
      await storage.fetchUpdates(repoPath);
      return `Repository ${dbRepository.pathName} updated successfully.`;
    } else {
      // Clone new repository
      const cloneUrl = authenticatedRepoUrl || dbRepository.url;
      await storage.cloneFromGit(cloneUrl, repoPath);
      return `Repository ${dbRepository.pathName} cloned successfully.`;
    }
  } catch (error: any) {
    // Handle git command failures
    if (error.message.includes('Could not resolve host')) {
      throw new Error(
        `Network error: Unable to resolve host for ${dbRepository.url}`
      );
    } else if (error.message.includes('Repository not found')) {
      throw new Error(`Repository not found: ${dbRepository.url}`);
    } else if (error.message.includes('Permission denied')) {
      throw new Error(
        `Permission denied: Ensure you have access to the repository ${dbRepository.url}`
      );
    } else {
      logger.error(`Error processing repository: ${error.message}`);
      throw new Error(`Failed to process repository: ${error.message}`);
    }
  }
};

interface GetDbUserResult {
  user: any;
  rateLimitHit: boolean;
}

async function getDbUser(
  author_email: string,
  usersCache: Map<string, any>,
  githubToken: string | null = null
): Promise<GetDbUserResult> {
  let dbUser = null;
  let rateLimitHit = false;
  
  // Determine username from no-reply email, if applicable
  const isNoReply = author_email.endsWith('@users.noreply.github.com');

  const username = isNoReply
    ? author_email.split('@')[0].split('+')[1] || author_email.split('@')[0]
    : null;
  logger.debug(username, 'username');
  dbUser =
    usersCache.get(author_email) ||
    (username ? usersCache.get(username) : null);
  if (dbUser) return { user: dbUser, rateLimitHit: false };
  logger.debug(dbUser, 'dbUser from here');

  // Query database for existing user
  dbUser = await prisma.contributor.findFirst({
    where: {
      OR: [{ email: author_email }, ...(username ? [{ username }] : [])],
    },
  });

  if (dbUser) {
    // If user exists, check lastUpdated for refresh
    const TWENTY_FOUR_HOURS = 60 * 60 * 24 * 1000;
    const twentyFourHoursAgo = Date.now() - TWENTY_FOUR_HOURS;

    if (!isNoReply && dbUser.updatedAt.getTime() < twentyFourHoursAgo) {
      logger.info('Fetching updated profile from GitHub...');
      try {
        const token = githubToken || process.env.GITHUB_TOKEN;
        if (!token || token === 'your_token_optional') {
          logger.warn('No valid GitHub token available for API call');
          usersCache.set(author_email, dbUser);
          if (username) usersCache.set(username, dbUser);
          return { user: dbUser, rateLimitHit: false };
        }
        
        // Check rate limits before making the request
        await rateLimitHandler.checkAndWait();
        
        const response = await axios.get(
          `https://api.github.com/search/users?q=${author_email}+in:email`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Update rate limit state from response
        rateLimitHandler.updateFromResponse(response);

        if (response.data.items.length > 0) {
          const { login, html_url } = response.data.items[0];

          // Update the user in the database
          dbUser = await prisma.contributor.update({
            where: { id: dbUser.id },
            data: {
              username: login,
              email: author_email,
              profileUrl: html_url,
              updatedAt: new Date(),
            },
          });

          logger.debug(dbUser, 'dbUser updated from GitHub');
          usersCache.set(author_email, dbUser);
          if (username) usersCache.set(username, dbUser);
          return { user: dbUser, rateLimitHit: false };
        }
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        const statusCode = error.response?.status;
        
        // Check if rate limit was hit using the rate limit handler
        if (rateLimitHandler.isRateLimitError(error)) {
          rateLimitHit = true;
          logger.warn(`[RATE_LIMIT] GitHub API rate limit exceeded during refresh for ${author_email}, keeping existing user data`);
          // Update rate limit state from error response if available
          if (error.response) {
            rateLimitHandler.updateFromResponse(error.response);
          }
        } else {
          logger.error(
            `Failed to fetch GitHub user for email ${author_email}: ${errorMessage}`
          );
        }
        // Continue with existing user data
      }
    }

    // Cache and return the user
    usersCache.set(author_email, dbUser);
    if (username) usersCache.set(username, dbUser);
    return { user: dbUser, rateLimitHit };
  }

  // Fetch from GitHub if necessary
  if (!isNoReply) {
    try {
      const token = githubToken || process.env.GITHUB_TOKEN;
      if (!token || token === 'your_token_optional') {
        logger.warn('No valid GitHub token available for API call');
        // Create user with email only if no token available
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return { user: dbUser, rateLimitHit: false };
      }
      
      // Check rate limits before making the request
      await rateLimitHandler.checkAndWait();
      
      const response = await axios.get(
        `https://api.github.com/search/users?q=${author_email}+in:email`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update rate limit state from response
      rateLimitHandler.updateFromResponse(response);

      if (response.data.items.length > 0) {
        const { login, html_url } = response.data.items[0];

        dbUser = await prisma.contributor.upsert({
          where: { username: login }, // Match by unique username
          update: {
            email: author_email, // Update email if it exists
            profileUrl: html_url,
            updatedAt: new Date(),
          },
          create: {
            username: login,
            email: author_email,
            profileUrl: html_url,
          },
        });

        usersCache.set(author_email, dbUser);
        usersCache.set(login, dbUser);
        return { user: dbUser, rateLimitHit: false };
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      
      // Handle different error cases gracefully
      if (statusCode === 401 || errorMessage.includes('Bad credentials')) {
        // Invalid token - create user with email only
        logger.warn(`[AUTH] Invalid GitHub token for ${author_email}, creating user with email only`);
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return { user: dbUser, rateLimitHit: false };
      } else if (rateLimitHandler.isRateLimitError(error)) {
        // Rate limit hit - create user with email only and mark for refresh
        logger.warn(`[RATE_LIMIT] GitHub API rate limit exceeded for ${author_email}, creating user with email only (will refresh later)`);
        // Update rate limit state from error response if available
        if (error.response) {
          rateLimitHandler.updateFromResponse(error.response);
        }
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return { user: dbUser, rateLimitHit: true };
      } else {
        // Other errors - create user with email only instead of failing completely
        logger.warn(`[API_ERROR] GitHub API error (${statusCode}) for ${author_email}: ${errorMessage}, creating user with email only`);
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return { user: dbUser, rateLimitHit: false };
      }
    }
  }
  // Create a new user in the database
  dbUser = await prisma.contributor.create({
    data: isNoReply
      ? { username, profileUrl: `https://github.com/${username}` }
      : { email: author_email },
  });
  logger.debug(dbUser, 'dbUser from here 2.75');
  // Add to cache
  usersCache.set(author_email, dbUser);
  if (username) usersCache.set(username, dbUser);
  logger.debug(dbUser, 'dbUser from here 3');
  return { user: dbUser, rateLimitHit: false };
}

// Function to generate a leaderboard for contributors based on their commits in a repository
export const generateLeaderboard = async (
  dbRepository: any,
  githubToken: string | null = null
): Promise<{ leaderboard: any[]; rateLimitHit: boolean }> => {
  const repoPath = await storage.getLocalPath(dbRepository.pathName);
  const git = simpleGit(repoPath);

  const usersCache = new Map();
  const repositoryContributorCache = new Map();
  let rateLimitHit = false;

  try {
    const log = await git.log();

    for (const { author_email } of log.all) {
      // Let's skip commits without an email
      if (!author_email) {
        continue;
      }

      const { user: dbUser, rateLimitHit: userRateLimitHit } = await getDbUser(
        author_email,
        usersCache,
        githubToken
      );
      
      // Track if any user hit rate limit
      if (userRateLimitHit) {
        rateLimitHit = true;
      }
      
      logger.debug(dbUser, 'dbUser');
      if (repositoryContributorCache.has(dbUser.id)) {
        repositoryContributorCache.set(dbUser.id, {
          id: dbUser.id,
          commitCount:
            repositoryContributorCache.get(dbUser.id).commitCount + 1,
        });
      } else {
        repositoryContributorCache.set(dbUser.id, {
          id: dbUser.id,
          commitCount: 1,
        });
      }
    }

    await prisma
      .$transaction(
        Array.from(repositoryContributorCache.values()).map((contributor) =>
          prisma.repositoryContributor.upsert({
            where: {
              repositoryId_contributorId: {
                repositoryId: dbRepository.id,
                contributorId: contributor.id,
              },
            },
            update: { commitCount: contributor.commitCount },
            create: {
              contributorId: contributor.id,
              repositoryId: dbRepository.id,
              commitCount: contributor.commitCount,
            },
          })
        )
      )
      .catch((error) => {
        logger.error('Transaction failed: ', error);
        // Handle specific errors or rethrow if necessary
        throw error;
      });

    const leaderboard = Array.from(repositoryContributorCache.values()).sort(
      (a, b) => b.commitCount - a.commitCount
    );

    return { leaderboard, rateLimitHit };
  } catch (error: any) {
    // Log any errors that occur during the leaderboard generation
    logger.error(`Error generating leaderboard: ${error.message}`);
    // Rethrow the error to indicate failure
    throw new Error(`Failed to generate leaderboard: ${error.message}`);
  }
};

export const getLeaderboardForRepository = async (dbRepository: any) => {
  const leaderboard = await prisma.repositoryContributor.findMany({
    where: { repositoryId: dbRepository.id },
    include: { contributor: true },
    orderBy: { commitCount: 'desc' },
  });

  return {
    repository: dbRepository.url,
    top_contributors: leaderboard.map(({ contributor, commitCount }) => {
      return {
        username: contributor.username,
        profileUrl: contributor.profileUrl,
        commitCount: commitCount,
        email: contributor.email,
      };
    }),
  };
};
