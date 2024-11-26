import url from 'url';

export const normalizeRepoUrl = (repoUrl: string): string => {
  // Parse the URL to handle HTTPS and SSH cases
  const parsedUrl = url.parse(repoUrl);

  // If the URL is in SSH format (e.g., `git@github.com:...`), convert it to HTTPS
  if (repoUrl.startsWith('git@')) {
    const [_, host, repoPath] = repoUrl.match(/^git@(.*?):(.*)$/) || [];
    return `https://${host}/${repoPath}`.replace(/\.git$/, '').toLowerCase();
  }

  // For HTTPS URLs, normalize by removing `.git` and trailing slashes
  return `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`
    .replace(/\.git$/, '') // Remove `.git` extension
    .replace(/\/$/, '') // Remove trailing slash
    .toLowerCase(); // Convert to lowercase for consistency
};
