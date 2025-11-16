import fs from 'fs';
import path from 'path';

/**
 * Get the current version
 * Priority:
 * 1. APP_VERSION environment variable (set during Docker build from git tag)
 * 2. package.json version (for local development)
 * 
 * Works in both development (ts-node) and production (compiled) environments
 */
export function getVersion(): string {
  // First, check for build-time injected version (from Docker build arg)
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }

  // Fallback to package.json (for local development)
  try {
    // Try multiple possible paths for package.json
    // 1. From __dirname (works in compiled code: dist/src/utils -> /app/package.json)
    // 2. From process.cwd() (works in Docker containers: /app/package.json)
    // 3. From __dirname in development (src/utils -> /app/package.json)

    const possiblePaths = [
      path.join(__dirname, '../../../package.json'), // Compiled: dist/src/utils -> package.json
      path.join(process.cwd(), 'package.json'), // Current working directory
      path.join(__dirname, '../../package.json'), // Alternative: src/utils -> package.json
    ];

    for (const packageJsonPath of possiblePaths) {
      try {
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf8')
          );
          return packageJson.version || 'unknown';
        }
      } catch (e) {
        // Try next path
        continue;
      }
    }

    throw new Error('Could not find package.json in any expected location');
  } catch (error) {
    // Fallback if package.json can't be read
    // Log error in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.error('[VERSION] Error reading package.json:', error);
    }
    return 'unknown';
  }
}
