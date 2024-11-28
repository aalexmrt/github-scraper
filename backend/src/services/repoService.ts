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
  dbRepository: DbRepository
): Promise<string> => {
  const repoPath = path.join(REPO_BASE_PATH, dbRepository.pathName);
  const git = simpleGit();

  try {
    if (fs.existsSync(repoPath)) {
      console.log(`Fetching updates for repository: ${dbRepository.pathName}`);
      await git.cwd(repoPath).fetch();
      return `Repository ${dbRepository.pathName} updated successfully.`;
    } else {
      console.log(`Cloning repository: ${dbRepository.url}`);
      await git.clone(dbRepository.url, repoPath, ['--bare']); // Clone the repository in a bare format because we don't need the working directory
      console.log(`Repository ${dbRepository.pathName} cloned successfully.`);
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
  noReplyEmailUsersCache: Map<string, any>,
  emailUsersCache: Map<string, any>,
  usernameUsersCache: Map<string, any>
) {
  let dbUser = null;

  // Check if the email is a no-reply email
  if (author_email.endsWith('@users.noreply.github.com')) {
    const username =
      author_email.split('@')[0].split('+')[1] || author_email.split('@')[0];

    // Check in noReplyEmailUsersCache
    if (noReplyEmailUsersCache.has(author_email)) {
      dbUser = noReplyEmailUsersCache.get(author_email);
      if (dbUser) return dbUser;
    }

    // Check in usernameUsersCache
    if (usernameUsersCache.has(username)) {
      dbUser = usernameUsersCache.get(username);
      if (dbUser) {
        noReplyEmailUsersCache.set(author_email, dbUser);
        return dbUser;
      }
    }

    // Check in the database using the username
    dbUser = await prisma.contributor.findFirst({
      where: { username },
    });

    if (dbUser) {
      noReplyEmailUsersCache.set(author_email, dbUser);
      usernameUsersCache.set(username, dbUser);
      return dbUser;
    }

    // Create a new user in the database
    dbUser = await prisma.contributor.create({
      data: {
        username,
        profileUrl: `https://github.com/${username}`,
      },
    });

    // Add to cache and return
    noReplyEmailUsersCache.set(author_email, dbUser);
    usernameUsersCache.set(username, dbUser);
    return dbUser;
  } else {
    // Regular email handling
    // Check in emailUsersCache
    if (emailUsersCache.has(author_email)) {
      dbUser = emailUsersCache.get(author_email);
      if (dbUser) return dbUser;
    }

    // Check in the database using the email
    dbUser = await prisma.contributor.findFirst({
      where: { email: author_email },
    });

    if (dbUser) {
      emailUsersCache.set(author_email, dbUser);
      return dbUser;
    }

    // Fetch from GitHub
    try {
      const response = await axios.get(
        `https://api.github.com/search/users?q=${author_email}+in:email`,
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          },
        }
      );
      console.log(response.data);
      if (response.data.items.length > 0) {
        const { login, html_url } = response.data.items[0];

        // Check in usernameUsersCache using the login (username)
        if (usernameUsersCache.has(login)) {
          dbUser = usernameUsersCache.get(login);
          emailUsersCache.set(author_email, dbUser);
          return dbUser;
        }

        // Check in the database using the username
        dbUser = await prisma.contributor.findFirst({
          where: { username: login },
        });
        console.log(dbUser, 'this is the db user');
        if (dbUser) {
          emailUsersCache.set(author_email, dbUser);
          usernameUsersCache.set(login, dbUser);
          return dbUser;
        }

        // Create a new user in the database
        dbUser = await prisma.contributor.create({
          data: {
            username: login,
            email: author_email,
            profileUrl: html_url,
          },
        });
        // Add to cache and return
        emailUsersCache.set(author_email, dbUser);
        usernameUsersCache.set(login, dbUser);
        return dbUser;
      } else {
        dbUser = await prisma.contributor.create({
          data: {
            email: author_email,
          },
        });

        // Add to cache and return
        emailUsersCache.set(author_email, dbUser);
        return dbUser;
      }
    } catch (error) {
      // TODO: Handle API limits and not public users
      console.error(`Failed to fetch GitHub user for email: ${author_email}`);
    }
  }
}

// Function to generate a leaderboard for contributors based on their commits in a repository
export const generateLeaderboard = async (dbRepository: any) => {
  const repoPath = path.join(REPO_BASE_PATH, dbRepository.pathName);
  const git = simpleGit(repoPath);

  const noReplyEmailUsersCache = new Map();
  const emailUsersCache = new Map();
  const usernameUsersCache = new Map();
  const repositoryContributorCache = new Map();

  try {
    const log = await git.log();

    for (const { author_email, author_name } of log.all) {
      // Let's skip commits without an email or name
      if (!author_email || !author_name) {
        continue;
      }

      const dbUser = await getDbUser(
        author_email,
        noReplyEmailUsersCache,
        emailUsersCache,
        usernameUsersCache
      );

      let repositoryContributor = null;

      if (repositoryContributorCache.has(dbUser.id)) {
        repositoryContributor = repositoryContributorCache.get(dbUser.id);
        repositoryContributor.commitCount++;
        continue;
      }

      repositoryContributor = await prisma.repositoryContributor.findFirst({
        where: {
          contributorId: dbUser.id,
          repositoryId: dbRepository.id,
        },
      });

      if (!repositoryContributor) {
        repositoryContributor = await prisma.repositoryContributor.create({
          data: {
            contributorId: dbUser.id,
            repositoryId: dbRepository.id,
          },
        });

        repositoryContributorCache.set(dbUser.id, repositoryContributor);
      }
    }

    await prisma.$transaction(
      Array.from(repositoryContributorCache.values()).map((contributor) =>
        prisma.repositoryContributor.update({
          where: { id: contributor.id },
          data: { commitCount: contributor.commitCount },
        })
      )
    );

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
