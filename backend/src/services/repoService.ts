import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import prisma from '../utils/prisma';

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

const REPO_BASE_PATH = '/data/repos';

// Ensure the base directory exists
if (!fs.existsSync(REPO_BASE_PATH)) {
  fs.mkdirSync(REPO_BASE_PATH, { recursive: true });
}

export const syncRepository = async (
  dbRepository: DbRepository,
  token: string | null = null
): Promise<string> => {
  const repoPath = path.join(REPO_BASE_PATH, dbRepository.pathName);
  const git = simpleGit();
  console.log(dbRepository.url, 'this is the url');
  const authenticatedRepoUrl = dbRepository.url.replace(
    'https://github.com',
    `https://${token}@github.com`
  );
  console.log(authenticatedRepoUrl, 'this is the authenticated repo url');
  try {
    if (fs.existsSync(repoPath)) {
      await git.cwd(repoPath).fetch();
      return `Repository ${dbRepository.pathName} updated successfully.`;
    } else {
      const cloneUrl = authenticatedRepoUrl
        ? authenticatedRepoUrl
        : dbRepository.url;
      console.log(cloneUrl, 'this is the clone url');
      await git.clone(cloneUrl, repoPath, ['--bare']); // Clone the repository in a bare format because we don't need the working directory
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

async function getDbUser(author_email: string, usersCache: Map<string, any>) {
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
        const response = await axios.get(
          `https://api.github.com/search/users?q=${author_email}+in:email`,
          { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
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
      const response = await axios.get(
        `https://api.github.com/search/users?q=${author_email}+in:email`,
        { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
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
      console.error(error.response.data.message);
      // TODO: Handle API limits and not public users
      console.error(`Failed to fetch GitHub user for email: ${author_email}`);
      if (error.response.data.message.includes('API rate limit exceeded')) {
        // if we have hit the API rate limit, we should indicate our program that we need to wait for a while
      } else {
        throw new Error('Failed to fetch GitHub user for email.');
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
export const generateLeaderboard = async (dbRepository: any) => {
  const repoPath = path.join(REPO_BASE_PATH, dbRepository.pathName);
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

      const dbUser = await getDbUser(author_email, usersCache);
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
