import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const REPO_BASE_PATH = '/data/repos';

// Ensure the base directory exists
console.log(REPO_BASE_PATH)
console.log(fs.existsSync(REPO_BASE_PATH))
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



export const generateLeaderboard = async (
  repoUrl: string
): Promise<{ username: string; profileUrl: string; commitCount: number }[]> => {
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'default_repo';
  const repoPath = path.join(REPO_BASE_PATH, repoName);
  const git = simpleGit(repoPath);

  // In-memory cache for email lookups
  const emailCache = new Map<string, { username: string; profileUrl: string }>();
  const leaderboard = new Map<string, { commitCount: number; email: string, profileUrl: string }>();

  try {
    // Get commit history
    const log = await git.log();

    for (const commit of log.all) {
      const email = commit.author_email || '';
      const authorName = commit.author_name || '';

      let username: string;
      let profileUrl: string;

      if (email && email.endsWith('@users.noreply.github.com')) {
        // Handle noreply emails
        username = email.split('@')[0].split('+')[1] || email.split('@')[0];
        profileUrl = `https://github.com/${username}`;
      } else if (email) {
        // Check cache before making API call
        if (emailCache.has(email)) {
          const cachedResult = emailCache.get(email)!;
          username = cachedResult.username;
          profileUrl = cachedResult.profileUrl;
        } else {
          try {
            // Fetch from GitHub API and cache the result
            const response = await axios.get(`https://api.github.com/search/users?q=${email}+in:email`);
            if (response.data.items.length > 0) {
              const user = response.data.items[0];
              username = user.login;
              profileUrl = user.html_url;
              emailCache.set(email, { username, profileUrl });
            } else {
              username = authorName || 'Unknown User';
              profileUrl = 'Unknown Profile';
              emailCache.set(email, {username, profileUrl})
            }
          } catch {
            username = authorName || 'Unknown User';
            profileUrl = 'Unknown Profile';
          }
        }
      } else if (authorName) {
        // No email, fallback to author name
        username = authorName;
        profileUrl = 'Unknown Profile';
      } else {
        // Completely unknown contributor
        username = 'Unknown User';
        profileUrl = 'Unknown Profile';
      }

      // Update leaderboard data dynamically
      if (leaderboard.has(username)) {
        leaderboard.get(username)!.commitCount += 1;
      } else {
        leaderboard.set(username, { commitCount: 1, email, profileUrl });
      }
    }

    // Directly convert leaderboard map to sorted array
    return Array.from(leaderboard.entries())
      .map(([username, { commitCount, email, profileUrl }]) => ({
        username,
        email,
        profileUrl,
        commitCount,
      }))
      .sort((a, b) => b.commitCount - a.commitCount); // Sort by commit count
  } catch (error: any) {
    console.error(`Error generating leaderboard: ${error.message}`);
    throw new Error(`Failed to generate leaderboard: ${error.message}`);
  }


};
