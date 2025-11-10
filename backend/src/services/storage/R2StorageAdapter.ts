import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, createReadStream, mkdirSync, rmSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import simpleGit from 'simple-git';
import { StorageAdapter } from './StorageAdapter';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);
const TEMP_REPO_PATH = '/tmp/repos';

/**
 * Cloudflare R2 storage adapter for production
 * Stores repositories as tar.gz archives in R2
 * Downloads to temp location for Git operations, then uploads back
 */
export class R2StorageAdapter implements StorageAdapter {
  private s3Client: S3Client;
  private bucketName: string;
  private tempPath: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET_NAME || 'github-repos';
    this.tempPath = TEMP_REPO_PATH;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY'
      );
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Ensure temp directory exists
    if (!existsSync(this.tempPath)) {
      mkdirSync(this.tempPath, { recursive: true });
    }
  }

  async ensureDirectory(): Promise<void> {
    // R2 doesn't need directory creation, but ensure temp path exists
    if (!existsSync(this.tempPath)) {
      mkdirSync(this.tempPath, { recursive: true });
    }
  }

  async exists(repoPath: string): Promise<boolean> {
    try {
      const key = this.getR2Key(repoPath);
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getLocalPath(repoPath: string): Promise<string> {
    const localPath = path.join(this.tempPath, repoPath);
    
    // If already extracted locally, return it
    if (existsSync(localPath)) {
      return localPath;
    }

    // Download and extract from R2 if exists
    if (await this.exists(repoPath)) {
      await this.downloadAndExtract(repoPath, localPath);
    }

    return localPath;
  }

  async cloneFromGit(gitUrl: string, repoPath: string): Promise<void> {
    const localPath = path.join(this.tempPath, repoPath);
    
    // Clone to temp location
    const git = simpleGit();
    await git.clone(gitUrl, localPath, ['--bare']);

    // Compress and upload to R2
    await this.compressAndUpload(localPath, repoPath);
    
    // Clean up local copy (optional - keep for faster access)
    // rmSync(localPath, { recursive: true, force: true });
  }

  async fetchUpdates(repoPath: string): Promise<void> {
    const localPath = path.join(this.tempPath, repoPath);
    
    // Download and extract from R2 if not already local
    if (!existsSync(localPath)) {
      await this.downloadAndExtract(repoPath, localPath);
    }

    // Fetch updates
    const git = simpleGit(localPath);
    await git.fetch();

    // Compress and upload back to R2
    await this.compressAndUpload(localPath, repoPath);
  }

  async delete(repoPath: string): Promise<void> {
    const key = this.getR2Key(repoPath);
    
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
    } catch (error) {
      logger.error(`Failed to delete ${repoPath} from R2:`, error);
    }

    // Delete local temp copy if exists
    const localPath = path.join(this.tempPath, repoPath);
    if (existsSync(localPath)) {
      rmSync(localPath, { recursive: true, force: true });
    }
  }

  private getR2Key(repoPath: string): string {
    // R2 keys should not start with /
    return repoPath.startsWith('/') ? repoPath.slice(1) : repoPath + '.tar.gz';
  }

  private async downloadAndExtract(repoPath: string, localPath: string): Promise<void> {
    const key = this.getR2Key(repoPath);
    const archivePath = localPath + '.tar.gz';
    
    // Ensure local directory exists
    const dir = path.dirname(localPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      // Download from R2
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error(`No body in R2 response for ${repoPath}`);
      }

      // Write to file
      const writeStream = createWriteStream(archivePath);
      await pipeline(response.Body as any, writeStream);

      // Extract tar.gz
      await execAsync(`tar -xzf ${archivePath} -C ${dir}`);
      
      // Remove archive
      rmSync(archivePath);

      logger.info(`Downloaded and extracted ${repoPath} from R2`);
    } catch (error) {
      logger.error(`Failed to download ${repoPath} from R2:`, error);
      throw error;
    }
  }

  private async compressAndUpload(localPath: string, repoPath: string): Promise<void> {
    const key = this.getR2Key(repoPath);
    const archivePath = localPath + '.tar.gz';
    const dir = path.dirname(localPath);
    const repoName = path.basename(localPath);
    
    try {
      // Create tar.gz archive
      await execAsync(`cd ${dir} && tar -czf ${archivePath} ${repoName}`);

      // Upload to R2
      const readStream = createReadStream(archivePath);
      
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: readStream,
          ContentType: 'application/gzip',
        })
      );

      // Remove archive
      rmSync(archivePath);

      logger.info(`Compressed and uploaded ${repoPath} to R2`);
    } catch (error) {
      logger.error(`Failed to upload ${repoPath} to R2:`, error);
      throw error;
    }
  }
}
