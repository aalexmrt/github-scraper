// Storage abstraction interface
export interface StorageAdapter {
  exists(repoPath: string): Promise<boolean>;
  getLocalPath(repoPath: string): Promise<string>;
  cloneFromGit(gitUrl: string, repoPath: string): Promise<void>;
  fetchUpdates(repoPath: string): Promise<void>;
  delete(repoPath: string): Promise<void>;
  ensureDirectory(): Promise<void>;
}

