import prisma from './prisma';
import { repoQueue } from '../services/queueService';
import { normalizeRepoUrl } from './normalizeUrl';
import { isValidGitHubUrl } from './isValidGitHubUrl';
import { logger } from './logger';

// Demo repositories - small, resource-friendly repos
export const DEMO_REPOS = [
  {
    url: 'https://github.com/chalk/chalk',
    name: 'chalk',
    owner: 'chalk',
    description: 'Terminal string styling done right',
    featured: true,
    category: 'CLI Tool',
  },
  {
    url: 'https://github.com/sindresorhus/ora',
    name: 'ora',
    owner: 'sindresorhus',
    description: 'Elegant terminal spinners',
    featured: true,
    category: 'CLI Tool',
  },
  {
    url: 'https://github.com/sindresorhus/is',
    name: 'is',
    owner: 'sindresorhus',
    description: `Type check values: is.string('🦄') => true`,
    featured: true,
    category: 'Utility',
  },
  {
    url: 'https://github.com/mrmlnc/fast-glob',
    name: 'fast-glob',
    owner: 'mrmlnc',
    description: 'Fast and efficient glob library for Node.js',
    featured: false,
    category: 'Utility',
  },
  {
    url: 'https://github.com/sindresorhus/got',
    name: 'got',
    owner: 'sindresorhus',
    description: 'Human-friendly and powerful HTTP request library',
    featured: false,
    category: 'HTTP Client',
  },
  {
    url: 'https://github.com/axios/axios',
    name: 'axios',
    owner: 'axios',
    description: 'Promise based HTTP client for the browser and node.js',
    featured: false,
    category: 'HTTP Client',
  },
];

export interface PopulateResult {
  created: number;
  queued: number;
  skipped: number;
  errors: number;
}

/**
 * Populate demo repositories in the database.
 * This function is idempotent - it will skip repos that already exist and are completed.
 * 
 * @param options - Configuration options
 * @param options.silent - If true, don't log progress (default: false)
 * @returns Promise with population statistics
 */
export async function populateDemoRepos(options: { silent?: boolean } = {}): Promise<PopulateResult> {
  const { silent = false } = options;
  
  if (!silent) {
    logger.info('🚀 Starting demo repos population...\n');
  }

  const result: PopulateResult = {
    created: 0,
    queued: 0,
    skipped: 0,
    errors: 0,
  };

  for (const repo of DEMO_REPOS) {
    try {
      // Validate URL
      if (!isValidGitHubUrl(repo.url)) {
        if (!silent) {
          logger.error(`❌ Invalid GitHub URL: ${repo.url}`);
        }
        result.errors++;
        continue;
      }

      const normalizedUrl = normalizeRepoUrl(repo.url);
      const repoName = repo.name || normalizedUrl.split('/').pop()?.replace('.git', '') || 'default_repo';

      if (!silent) {
        logger.info(`📦 Processing: ${repo.owner}/${repo.name}...`);
      }

      // Check if repository already exists
      let dbRepository = await prisma.repository.findUnique({
        where: { url: normalizedUrl },
      });

      if (!dbRepository) {
        // Create new repository entry
        dbRepository = await prisma.repository.create({
          data: {
            url: normalizedUrl,
            pathName: repoName,
            state: 'pending',
            lastAttempt: new Date(),
          },
        });
        if (!silent) {
          logger.info(`   ✅ Created repository entry`);
        }
        result.created++;
      } else {
        if (!silent) {
          logger.info(`   ℹ️  Repository already exists (state: ${dbRepository.state})`);
        }
      }

      // Add to queue if not already completed
      if (dbRepository.state !== 'completed') {
        // Use GITHUB_TOKEN from environment if available (for better rate limits and user data)
        // For public repos, token is optional but recommended
        const token = process.env.GITHUB_TOKEN || null;
        
        // Bull handles duplicate jobs, so it's safe to add even if already queued
        await repoQueue.add({ dbRepository, token });
        if (!silent) {
          logger.info(`   📤 Added to processing queue${token ? ' (with GitHub token)' : ' (no token - public repos only)'}`);
        }
        result.queued++;
      } else {
        if (!silent) {
          logger.info(`   ⏭️  Skipped (already completed)`);
        }
        result.skipped++;
      }

      if (!silent) {
        logger.info('');
      }
    } catch (error: any) {
      if (!silent) {
        logger.error(`❌ Error processing ${repo.url}:`, error.message);
      }
      result.errors++;
      if (!silent) {
        logger.info('');
      }
    }
  }

  if (!silent) {
    // Summary
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('📊 Summary:');
    logger.info(`   ✅ Created: ${result.created}`);
    logger.info(`   📤 Queued: ${result.queued}`);
    logger.info(`   ⏭️  Skipped: ${result.skipped}`);
    logger.info(`   ❌ Errors: ${result.errors}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (result.queued > 0) {
      logger.info('⏳ Repositories have been queued for processing.');
      logger.info('   Monitor the worker logs to see processing progress.\n');
    }
  }

  return result;
}

