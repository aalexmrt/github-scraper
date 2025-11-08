/**
 * Utility functions for extracting repository information from URLs
 */

/**
 * Extract owner and repo name from a GitHub URL
 * For example: https://github.com/user/repo -> { owner: 'user', repoName: 'repo' }
 */
export function parseRepoUrl(url: string): { owner: string; repoName: string } | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      return {
        owner: pathParts[0],
        repoName: pathParts[1],
      };
    }
    return null;
  } catch {
    // If it's not a valid URL, try to parse as owner/repo format
    const parts = url.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return {
        owner: parts[0],
        repoName: parts[1],
      };
    }
    return null;
  }
}

/**
 * Reconstruct a GitHub URL from owner and repo name
 */
export function buildRepoUrl(owner: string, repoName: string): string {
  return `https://github.com/${owner}/${repoName}`;
}

/**
 * Get route path for a repository leaderboard
 */
export function getLeaderboardRoute(repoUrl: string): string | null {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;
  return `/repo/${parsed.owner}/${parsed.repoName}/leaderboard`;
}

