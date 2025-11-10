import fs from 'fs';
import path from 'path';

/**
 * Get the current version from package.json
 * Works in both development (ts-node) and production (compiled) environments
 */
export function getVersion(): string {
  try {
    // In development (ts-node), __dirname points to src/utils
    // In production (compiled), __dirname points to dist/src/utils
    // We need to go up 3 levels: dist/src/utils -> dist/src -> dist -> /app -> package.json
    const packageJsonPath = path.join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || 'unknown';
  } catch (error) {
    // Fallback if package.json can't be read
    // Log error in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.error('[VERSION] Error reading package.json:', error);
    }
    return 'unknown';
  }
}
