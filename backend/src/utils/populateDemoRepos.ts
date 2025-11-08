import prisma from '../src/utils/prisma';
import { repoQueue } from '../src/services/queueService';
import { normalizeRepoUrl } from '../src/utils/normalizeUrl';
import { isValidGitHubUrl } from '../src/utils/isValidGitHubUrl';

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
    url: 'https://github.com/commander-js/commander',
    name: 'commander',
    owner: 'commander-js',
    description: 'Complete solution for Node.js command-line programs',
    featured: true,
    category: 'CLI Framework',
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
    console.log('🚀 Starting demo repos population...\n');
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
          console.error(`❌ Invalid GitHub URL: ${repo.url}`);
        }
        result.errors++;
        continue;
      }

      const normalizedUrl = normalizeRepoUrl(repo.url);
      const repoName = repo.name || normalizedUrl.split('/').pop()?.replace('.git', '') || 'default_repo';

      if (!silent) {
        console.log(`📦 Processing: ${repo.owner}/${repo.name}...`);
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
          console.log(`   ✅ Created repository entry`);
        }
        result.created++;
      } else {
        if (!silent) {
          console.log(`   ℹ️  Repository already exists (state: ${dbRepository.state})`);
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
          console.log(`   📤 Added to processing queue${token ? ' (with GitHub token)' : ' (no token - public repos only)'}`);
        }
        result.queued++;
      } else {
        if (!silent) {
          console.log(`   ⏭️  Skipped (already completed)`);
        }
        result.skipped++;
      }

      if (!silent) {
        console.log('');
      }
    } catch (error: any) {
      if (!silent) {
        console.error(`❌ Error processing ${repo.url}:`, error.message);
      }
      result.errors++;
      if (!silent) {
        console.log('');
      }
    }
  }

  if (!silent) {
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log(`   ✅ Created: ${result.created}`);
    console.log(`   📤 Queued: ${result.queued}`);
    console.log(`   ⏭️  Skipped: ${result.skipped}`);
    console.log(`   ❌ Errors: ${result.errors}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (result.queued > 0) {
      console.log('⏳ Repositories have been queued for processing.');
      console.log('   Monitor the worker logs to see processing progress.\n');
    }
  }

  return result;
}

