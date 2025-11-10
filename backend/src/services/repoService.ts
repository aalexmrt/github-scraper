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
  lastAttempt: Date | null;
  lastProcessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Initialize storage adapter (filesystem for local, R2 for production)
const storage = createStorageAdapter();

// Repository size limits (configurable via environment variables)
const MAX_REPO_SIZE_MB = parseInt(process.env.MAX_REPO_SIZE_MB || '250', 10);
const MAX_REPO_SIZE_BYTES = MAX_REPO_SIZE_MB * 1024 * 1024;
const MAX_COMMIT_COUNT = parseInt(process.env.MAX_COMMIT_COUNT || '2500', 10);

/**
 * Check repository size via GitHub API
 * Returns size in bytes, or null if check fails or token unavailable
 */
async function checkRepoSizeViaAPI(
  url: string,
  token: string | null
): Promise<{ size: number; commitCount?: number } | null> {
  if (!token) {
    logger.debug('[REPO_SERVICE] No token available for API size check');
    return null;
  }

  try {
    // Parse owner/repo from URL
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?\/?$/);
    if (!match) {
      logger.warn(`[REPO_SERVICE] Could not parse GitHub URL: ${url}`);
      return null;
    }

    const [, owner, repo] = match;

    // Check rate limits before making request
    await rateLimitHandler.checkAndWait();

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    rateLimitHandler.updateFromResponse(response);

    // GitHub API returns size in KB (approximate size of repository when cloned)
    const sizeKB = response.data.size || 0;
    const sizeBytes = sizeKB * 1024;

    logger.info(
      `[REPO_SERVICE] Repository ${owner}/${repo} size: ${(sizeBytes / 1024 / 1024).toFixed(2)}MB (from API)`
    );

    return { size: sizeBytes };
  } catch (error: any) {
    // If API fails, log but don't throw - fallback to clone-then-check
    if (rateLimitHandler.isRateLimitError(error)) {
      logger.warn(
        `[REPO_SERVICE] Rate limit hit while checking repo size via API: ${url}`
      );
    } else {
      logger.warn(
        `[REPO_SERVICE] Failed to check repo size via API for ${url}: ${error.message}`
      );
    }
    return null;
  }
}

/**
 * Get commit count for a repository
 */
async function getCommitCount(repoPath: string): Promise<number> {
  try {
    const localPath = await storage.getLocalPath(repoPath);
    const git = simpleGit(localPath);
    const count = await git.raw(['rev-list', '--count', '--all']);
    return parseInt(count.trim(), 10);
  } catch (error: any) {
    logger.error(`[REPO_SERVICE] Failed to get commit count: ${error.message}`);
    throw error;
  }
}

/**
 * Get repository size from filesystem
 */
async function getRepoSize(repoPath: string): Promise<number> {
  try {
    const localPath = await storage.getLocalPath(repoPath);
    const { execSync } = require('child_process');
    const sizeStr = execSync(`du -sb "${localPath}"`, { encoding: 'utf-8' });
    const sizeBytes = parseInt(sizeStr.split('\t')[0], 10);
    return sizeBytes;
  } catch (error: any) {
    logger.error(`[REPO_SERVICE] Failed to get repo size: ${error.message}`);
    throw error;
  }
}

/**
 * Validate repository size and commit count
 * Throws error if limits exceeded
 */
async function validateRepoLimits(
  repoPath: string,
  url: string
): Promise<void> {
  // Check disk size
  const repoSize = await getRepoSize(repoPath);
  const sizeMB = repoSize / 1024 / 1024;

  if (repoSize > MAX_REPO_SIZE_BYTES) {
    // Delete the oversized repository
    await storage.delete(repoPath);
    throw new Error(
      `Repository too large: ${sizeMB.toFixed(2)}MB exceeds limit of ${MAX_REPO_SIZE_MB}MB`
    );
  }

  // Check commit count
  const commitCount = await getCommitCount(repoPath);
  if (commitCount > MAX_COMMIT_COUNT) {
    // Delete the repository with too many commits
    await storage.delete(repoPath);
    throw new Error(
      `Repository has too many commits: ${commitCount.toLocaleString()} exceeds limit of ${MAX_COMMIT_COUNT.toLocaleString()}`
    );
  }

  logger.info(
    `[REPO_SERVICE] Repository ${url} validated: ${sizeMB.toFixed(2)}MB, ${commitCount.toLocaleString()} commits`
  );
}

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
      logger.info(
        `[REPO_SERVICE] Repository ${dbRepository.url} already exists, fetching updates...`
      );
      await storage.fetchUpdates(repoPath);
      
      // Validate size after fetch (in case updates pushed it over limit)
      await validateRepoLimits(repoPath, dbRepository.url);
      
      return `Repository ${dbRepository.pathName} updated successfully.`;
    } else {
      // Check size via GitHub API first (if token available)
      const apiCheck = await checkRepoSizeViaAPI(
        dbRepository.url,
        token || process.env.GITHUB_TOKEN || null
      );

      if (apiCheck) {
        if (apiCheck.size > MAX_REPO_SIZE_BYTES) {
          const sizeMB = (apiCheck.size / 1024 / 1024).toFixed(2);
          throw new Error(
            `Repository too large: ${sizeMB}MB exceeds limit of ${MAX_REPO_SIZE_MB}MB`
          );
        }
        logger.info(
          `[REPO_SERVICE] Repository size check passed via API: ${(apiCheck.size / 1024 / 1024).toFixed(2)}MB`
        );
      } else {
        logger.info(
          `[REPO_SERVICE] API size check unavailable, will check after clone`
        );
      }

      // Clone new repository
      const cloneUrl = authenticatedRepoUrl || dbRepository.url;
      logger.info(`[REPO_SERVICE] Cloning repository ${dbRepository.url}...`);
      await storage.cloneFromGit(cloneUrl, repoPath);

      // Validate size and commit count after clone (fallback if API check failed)
      await validateRepoLimits(repoPath, dbRepository.url);

      return `Repository ${dbRepository.pathName} cloned successfully.`;
    }
  } catch (error: any) {
    // Handle size limit errors specifically
    if (
      error.message.includes('too large') ||
      error.message.includes('too many commits')
    ) {
      throw error; // Re-throw size limit errors as-is
    }

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

// Function to process commits and extract email data (no API calls)
// Returns array of { email, count } pairs
export async function processCommits(
  dbRepository: DbRepository
): Promise<Array<{ email: string; count: number }>> {
  const repoPath = await storage.getLocalPath(dbRepository.pathName);
  const git = simpleGit(repoPath);

  // Check commit count before processing (safety check)
  const commitCount = await getCommitCount(dbRepository.pathName);
  if (commitCount > MAX_COMMIT_COUNT) {
    throw new Error(
      `Repository has too many commits: ${commitCount.toLocaleString()} exceeds limit of ${MAX_COMMIT_COUNT.toLocaleString()}`
    );
  }

  const emailToCount = new Map<string, number>();

  try {
    const log = await git.log();

    // Count commits per email
    for (const { author_email } of log.all) {
      if (!author_email) {
        continue;
      }

      const currentCount = emailToCount.get(author_email) || 0;
      emailToCount.set(author_email, currentCount + 1);
    }

    // Convert to array format
    return Array.from(emailToCount.entries()).map(([email, count]) => ({
      email,
      count,
    }));
  } catch (error: any) {
    logger.error(`Error processing commits: ${error.message}`);
    throw new Error(`Failed to process commits: ${error.message}`);
  }
}

async function getDbUser(
  author_email: string,
  usersCache: Map<string, any>
): Promise<any> {
  // Determine username from no-reply email, if applicable
  const isNoReply = author_email.endsWith('@users.noreply.github.com');

  const username = isNoReply
    ? author_email.split('@')[0].split('+')[1] || author_email.split('@')[0]
    : null;

  // Check cache first
  let dbUser =
    usersCache.get(author_email) ||
    (username ? usersCache.get(username) : null);
  if (dbUser) return dbUser;

  // Query database for existing user
  dbUser = await prisma.contributor.findFirst({
    where: {
      OR: [{ email: author_email }, ...(username ? [{ username }] : [])],
    },
  });

  if (dbUser) {
    // Cache and return the user
    usersCache.set(author_email, dbUser);
    if (username) usersCache.set(username, dbUser);
    return dbUser;
  }

  // Create a new user in the database (no API calls)
  // For no-reply emails, we can extract username
  // For regular emails, create with email only (will be enriched later by user worker)
  dbUser = await prisma.contributor.create({
    data: isNoReply
      ? { username, profileUrl: `https://github.com/${username}` }
      : { email: author_email },
  });

  // Add to cache
  usersCache.set(author_email, dbUser);
  if (username) usersCache.set(username, dbUser);

  return dbUser;
}

// Function to generate a leaderboard for contributors based on their commits in a repository
// Note: This function no longer makes GitHub API calls - it only processes commits and uses existing DB data
export const generateLeaderboard = async (
  dbRepository: any
): Promise<{ leaderboard: any[] }> => {
  const repoPath = await storage.getLocalPath(dbRepository.pathName);
  const git = simpleGit(repoPath);

  const usersCache = new Map();
  const repositoryContributorCache = new Map();

  try {
    const log = await git.log();

    for (const { author_email } of log.all) {
      // Let's skip commits without an email
      if (!author_email) {
        continue;
      }

      // Get or create user from database (no API calls)
      const dbUser = await getDbUser(author_email, usersCache);

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

    return { leaderboard };
  } catch (error: any) {
    // Log any errors that occur during the leaderboard generation
    logger.error(`Error generating leaderboard: ${error.message}`);
    // Rethrow the error to indicate failure
    throw new Error(`Failed to generate leaderboard: ${error.message}`);
  }
};

/**
 * Build leaderboard from CommitData when RepositoryContributor data isn't ready yet
 * This allows showing the leaderboard once commits are processed, even if user processing is ongoing
 */
export const getLeaderboardFromCommitData = async (dbRepository: any) => {
  const commitData = await prisma.commitData.findMany({
    where: { repositoryId: dbRepository.id },
    orderBy: { commitCount: 'desc' },
  });

  if (commitData.length === 0) {
    return {
      repository: dbRepository.url,
      top_contributors: [],
      isPartial: false,
    };
  }

  // Get all emails from commit data
  const emails = commitData.map((commit) => commit.authorEmail);

  // Fetch all contributors in one query
  const contributors = await prisma.contributor.findMany({
    where: {
      email: { in: emails },
    },
  });

  // Create a map for quick lookup
  const contributorMap = new Map(
    contributors.map((c) => [c.email, c])
  );

  // Enrich commit data with contributor information
  const enrichedContributors = commitData.map((commit) => {
    const contributor = contributorMap.get(commit.authorEmail);

    return {
      username: contributor?.username || null,
      profileUrl: contributor?.profileUrl || null,
      commitCount: commit.commitCount,
      email: commit.authorEmail,
      isEnriched: !!contributor, // Flag to indicate if user data is available
    };
  });

  return {
    repository: dbRepository.url,
    top_contributors: enrichedContributors,
    isPartial: enrichedContributors.some((c) => !c.isEnriched), // Indicates some data is still being processed
  };
};

export const getLeaderboardForRepository = async (dbRepository: any) => {
  // Check if commits have been processed
  const hasCommitsProcessed = !!dbRepository.commitsProcessedAt;

  if (!hasCommitsProcessed) {
    // No commit data available yet
    return {
      repository: dbRepository.url,
      top_contributors: [],
      isPartial: false,
    };
  }

  // Try to get leaderboard from RepositoryContributor (complete data)
  const repositoryContributors = await prisma.repositoryContributor.findMany({
    where: { repositoryId: dbRepository.id },
    include: { contributor: true },
    orderBy: { commitCount: 'desc' },
  });

  // If we have RepositoryContributor data, use it (most complete)
  if (repositoryContributors.length > 0) {
    return {
      repository: dbRepository.url,
      top_contributors: repositoryContributors.map(
        ({ contributor, commitCount }) => {
          return {
            username: contributor.username,
            profileUrl: contributor.profileUrl,
            commitCount: commitCount,
            email: contributor.email,
            isEnriched: true,
          };
        }
      ),
      isPartial: false,
    };
  }

  // Fallback to CommitData if RepositoryContributor isn't ready yet
  // This happens when commits are processed but user processing is still ongoing
  return await getLeaderboardFromCommitData(dbRepository);
};
