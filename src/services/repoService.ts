import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const REPO_BASE_PATH = '/data/repos';

// Ensure the base directory exists
if (!fs.existsSync(REPO_BASE_PATH)) {
  console.log("asd")
  fs.mkdirSync(REPO_BASE_PATH, { recursive: true });
}

export const processRepository = async (repoUrl: string): Promise<string> => {
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'default_repo';
  const repoPath = path.join(REPO_BASE_PATH, repoName);
  console.log(repoPath, fs.existsSync(repoPath), 'this')
  const git = simpleGit();

  try {
    if (fs.existsSync(repoPath)) {
      console.log(`Fetching updates for repository: ${repoName}`);
      await git.cwd(repoPath).fetch();
      return `Repository ${repoName} updated successfully.`;
    } else {
      console.log(`Cloning repository: ${repoUrl}`);
      await git.clone(repoUrl, repoPath, ['--bare']); // Bare clone
      console.log(`Repository ${repoName} cloned successfully.`);
      return `Repository ${repoName} cloned successfully.`;
    }
  } catch (error:any) {
    console.error(`Error processing repository: ${error.message}`);
    throw new Error(`Failed to process repository: ${error.message}`);
  }
};



// Function to resolve user information based on email
async function resolveUserInfo(
  email: string, // Email of the contributor
  authorName: string, // Author name as fallback if no email
  emailCache: Map<string, { identifier: string, username: string, profileUrl: string }>
  // Cache to store and retrieve previously fetched user information
) {
  // If there is no email provided, use author name as the identifier
  if (!email) {
      return { identifier: authorName, username: 'Unknown Username', profileUrl: 'Unknown Profile' };
  }

  // Check if the email is a GitHub noreply email
  if (email.endsWith('@users.noreply.github.com')) {
      // Extract username from the noreply email
      const username = email.split('@')[0].split('+')[1] || email.split('@')[0];
      // Return user info with GitHub profile URL
      return { identifier: username, username, profileUrl: `https://github.com/${username}` };
  }

  // Check if the user information is already in the cache
  const cachedUser = emailCache.get(email);
  if (cachedUser) {
      // Return cached user info if available
      return cachedUser;
  }

  // If not cached, fetch user information from GitHub API
  try {
      const response = await axios.get(`https://api.github.com/search/users?q=${email}+in:email`);
      // Check if the API call returned any users
      if (response.data.items.length > 0) {
          const { login, html_url } = response.data.items[0];
          // Construct user info from API response
          const userInfo = { identifier: login, username: login, profileUrl: html_url };
          // Cache this user info for future reference
          emailCache.set(email, userInfo);
          return userInfo;
      }
  } catch (error) {
      // Log any errors during the API call
      console.error(`Failed to fetch user info for email: ${email}`, error);
  }

  // If user info can't be resolved, return a fallback with the email as the identifier
  const fallbackInfo = { identifier: email, username: 'Unknown Username', profileUrl: 'Unknown Profile' };
  // Cache the fallback info as well
  emailCache.set(email, fallbackInfo);
  return fallbackInfo;
}

// Function to generate a leaderboard for contributors based on their commits in a repository
export const generateLeaderboard = async (repoUrl: string) => {
  // Extract the repository name from the URL
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'default_repo';
  // Build the path to where the repository is stored
  const repoPath = path.join(REPO_BASE_PATH, repoName);
  // Initialize a git interface pointing to the repository path
  const git = simpleGit(repoPath);
  // Cache to store user information to prevent redundant API calls
  const emailCache = new Map();

  try {
      // Fetch the commit log from the git repository
      const log = await git.log();
      // Map to hold the leaderboard data
      const leaderboard = new Map();

      // Process each commit in the log
      for (const { author_email, author_name } of log.all) {
          // Resolve user information based on email and name, using the cache
          const { identifier, username, profileUrl } = await resolveUserInfo(author_email, author_name, emailCache);
          // Check if the contributor already exists in the leaderboard
          const leaderboardEntry = leaderboard.get(identifier) || { commitCount: 0, username, email: author_email || '', profileUrl };

          // Increment the commit count for this contributor
          leaderboardEntry.commitCount++;
          // Update the leaderboard with the new entry
          leaderboard.set(identifier, leaderboardEntry);
      }

      // Convert the leaderboard map to an array and sort it by commit count in descending order
      return Array.from(leaderboard.values())
          .sort((a, b) => b.commitCount - a.commitCount);
  } catch (error: any) {
      // Log any errors that occur during the leaderboard generation
      console.error(`Error generating leaderboard: ${error.message}`);
      // Rethrow the error to indicate failure
      throw new Error(`Failed to generate leaderboard: ${error.message}`);
  }
};

