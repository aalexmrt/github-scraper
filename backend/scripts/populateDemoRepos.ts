import dotenv from 'dotenv';
import prisma from '../src/utils/prisma';
import { repoQueue } from '../src/services/queueService';
import { normalizeRepoUrl } from '../src/utils/normalizeUrl';
import { isValidGitHubUrl } from '../src/utils/isValidGitHubUrl';

dotenv.config();

// Demo repositories - small, resource-friendly repos
const DEMO_REPOS = [
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

async function populateDemoRepos() {
  console.log('🚀 Starting demo repos population...\n');

  let created = 0;
  let queued = 0;
  let skipped = 0;
  let errors = 0;

  for (const repo of DEMO_REPOS) {
    try {
      // Validate URL
      if (!isValidGitHubUrl(repo.url)) {
        console.error(`❌ Invalid GitHub URL: ${repo.url}`);
        errors++;
        continue;
      }

      const normalizedUrl = normalizeRepoUrl(repo.url);
      const repoName = repo.name || normalizedUrl.split('/').pop()?.replace('.git', '') || 'default_repo';

      console.log(`📦 Processing: ${repo.owner}/${repo.name}...`);

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
        console.log(`   ✅ Created repository entry`);
        created++;
      } else {
        console.log(`   ℹ️  Repository already exists (state: ${dbRepository.state})`);
      }

      // Add to queue if not already completed
      if (dbRepository.state !== 'completed') {
        // Check if job is already in queue (we'll add it anyway, Bull handles duplicates)
        await repoQueue.add({ dbRepository, token: null });
        console.log(`   📤 Added to processing queue`);
        queued++;
      } else {
        console.log(`   ⏭️  Skipped (already completed)`);
        skipped++;
      }

      console.log('');
    } catch (error: any) {
      console.error(`❌ Error processing ${repo.url}:`, error.message);
      errors++;
      console.log('');
    }
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`   ✅ Created: ${created}`);
  console.log(`   📤 Queued: ${queued}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (queued > 0) {
    console.log('⏳ Repositories have been queued for processing.');
    console.log('   Monitor the worker logs to see processing progress.\n');
  }

  // Close Prisma connection
  await prisma.$disconnect();
  
  // Close Redis connection
  await repoQueue.close();

  process.exit(errors > 0 ? 1 : 0);
}

// Run the script
populateDemoRepos().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

