import { StorageAdapter } from './StorageAdapter';
import { FilesystemStorageAdapter } from './FilesystemStorageAdapter';
import { R2StorageAdapter } from './R2StorageAdapter';
import { logger } from '../../utils/logger';

/**
 * Factory to create the appropriate storage adapter based on environment
 * Uses R2 in production, filesystem in development
 */
export function createStorageAdapter(): StorageAdapter {
  const useR2 = process.env.USE_R2_STORAGE === 'true';
  
  if (useR2) {
    logger.info('Using Cloudflare R2 storage adapter');
    return new R2StorageAdapter();
  } else {
    logger.info('Using filesystem storage adapter');
    return new FilesystemStorageAdapter();
  }
}


