import simpleGit from 'simple-git';
import prisma from '../utils/prisma';
import { createStorageAdapter } from './storage/storageFactory';
import { logger } from '../utils/logger';

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
  let dbUser = usersCache.get(author_email) || (username ? usersCache.get(username) : null);
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
