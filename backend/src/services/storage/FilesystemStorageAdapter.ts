import fs from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import { StorageAdapter } from './StorageAdapter';

const DEFAULT_REPO_BASE_PATH = '/data/repos';

/**
 * Filesystem storage adapter for local development
 * Uses Docker volumes for repository storage
 */
export class FilesystemStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath: string = DEFAULT_REPO_BASE_PATH) {
    this.basePath = basePath;
    this.ensureDirectory();
  }

  async ensureDirectory(): Promise<void> {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  async exists(repoPath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, repoPath);
    return fs.existsSync(fullPath);
  }

  async getLocalPath(repoPath: string): Promise<string> {
    return path.join(this.basePath, repoPath);
  }

  async cloneFromGit(gitUrl: string, repoPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, repoPath);
    const git = simpleGit();
    await git.clone(gitUrl, fullPath, ['--bare']);
  }

  async fetchUpdates(repoPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, repoPath);
    const git = simpleGit(fullPath);
    await git.fetch();
  }

  async delete(repoPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, repoPath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}
