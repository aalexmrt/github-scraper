export const isValidGitHubUrl = (url: string): boolean => {
  const regex = /^(https:\/\/|git@)github\.com[:\/][\w-]+\/[\w-]+(\.git)?\/?$/i;
  // This regex now accounts for:
  // - HTTPS with or without a trailing slash
  // - HTTPS with .git
  // - SSH URLs
  return regex.test(url);
};
