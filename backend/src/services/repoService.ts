import simpleGit from 'simple-git';
import axios from 'axios';
import prisma from '../utils/prisma';
import { createStorageAdapter } from './storage/storageFactory';

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
      console.error(`Error processing repository: ${error.message}`);
      throw new Error(`Failed to process repository: ${error.message}`);
    }
  }
};

async function getDbUser(
  author_email: string,
  usersCache: Map<string, any>,
  githubToken: string | null = null
) {
  let dbUser = null;
  // Determine username from no-reply email, if applicable
  const isNoReply = author_email.endsWith('@users.noreply.github.com');

  const username = isNoReply
    ? author_email.split('@')[0].split('+')[1] || author_email.split('@')[0]
    : null;
  console.log(username, 'username');
  dbUser =
    usersCache.get(author_email) ||
    (username ? usersCache.get(username) : null);
  if (dbUser) return dbUser;
  console.log(dbUser, 'dbUser from here');

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
      console.log('Fetching updated profile from GitHub...');
      try {
        const token = githubToken || process.env.GITHUB_TOKEN;
        if (!token || token === 'your_token_optional') {
          console.warn('No valid GitHub token available for API call');
          return dbUser;
        }
        const response = await axios.get(
          `https://api.github.com/search/users?q=${author_email}+in:email`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

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

          console.log(dbUser, 'dbUser updated from GitHub');
          usersCache.set(author_email, dbUser);
          if (username) usersCache.set(username, dbUser);
          return dbUser;
        }
      } catch (error: any) {
        console.error(
          error,
          'Failed to fetch GitHub user for email:',
          author_email
        );
        console.error(error.response?.data?.message || error.message);
      }
    }

    // Cache and return the user
    usersCache.set(author_email, dbUser);
    if (username) usersCache.set(username, dbUser);
    return dbUser;
  }

  // Fetch from GitHub if necessary
  if (!isNoReply) {
    try {
      const token = githubToken || process.env.GITHUB_TOKEN;
      if (!token || token === 'your_token_optional') {
        console.warn('No valid GitHub token available for API call');
        // Create user with email only if no token available
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return dbUser;
      }
      
      const response = await axios.get(
        `https://api.github.com/search/users?q=${author_email}+in:email`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

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
        return dbUser;
      }
    } catch (error: any) {
      console.error(
        error,
        'Failed to fetch GitHub user for email:',
        author_email
      );
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      console.error(errorMessage);
      
      // Handle different error cases gracefully
      if (statusCode === 401 || errorMessage.includes('Bad credentials')) {
        // Invalid token - create user with email only
        console.warn('Invalid GitHub token, creating user with email only');
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return dbUser;
      } else if (errorMessage.includes('API rate limit exceeded')) {
        // if we have hit the API rate limit, we should indicate our program that we need to wait for a while
        // For now, create user with email only
        console.warn('GitHub API rate limit exceeded, creating user with email only');
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return dbUser;
      } else {
        // Other errors - create user with email only instead of failing completely
        console.warn(`GitHub API error (${statusCode}): ${errorMessage}, creating user with email only`);
        dbUser = await prisma.contributor.create({
          data: { email: author_email },
        });
        usersCache.set(author_email, dbUser);
        return dbUser;
      }
    }
  }
  // Create a new user in the database
  dbUser = await prisma.contributor.create({
    data: isNoReply
      ? { username, profileUrl: `https://github.com/${username}` }
      : { email: author_email },
  });
  console.log(dbUser, 'dbUser from here 2.75');
  // Add to cache
  usersCache.set(author_email, dbUser);
  if (username) usersCache.set(username, dbUser);
  console.log(dbUser, 'dbUser from here 3');
  return dbUser;
}

// Function to generate a leaderboard for contributors based on their commits in a repository
export const generateLeaderboard = async (
  dbRepository: any,
  githubToken: string | null = null
) => {
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

      const dbUser = await getDbUser(author_email, usersCache, githubToken);
      console.log(dbUser, 'dbUser');
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
        console.error('Transaction failed: ', error);
        // Handle specific errors or rethrow if necessary
        throw error;
      });

    const leaderboard = Array.from(repositoryContributorCache.values()).sort(
      (a, b) => b.commitCount - a.commitCount
    );

    return leaderboard;
  } catch (error: any) {
    // Log any errors that occur during the leaderboard generation
    console.error(`Error generating leaderboard: ${error.message}`);
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
