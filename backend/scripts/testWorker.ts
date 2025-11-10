#!/usr/bin/env node
/**
 * Test Worker Script
 * Adds a test repository to the queue and optionally triggers the worker
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { repoQueue } from '../src/services/queueService';
import prisma from '../src/utils/prisma';
import { normalizeRepoUrl } from '../src/utils/normalizeUrl';
import { isValidGitHubUrl } from '../src/utils/isValidGitHubUrl';
import { logger } from '../src/utils/logger';

async function testWorker() {
  const repoUrl = process.argv[2] || 'https://github.com/vercel/next.js';

  logger.info('🧪 Worker Test Script');
  logger.info('====================');
  logger.info('');

  // Step 1: Validate URL
  if (!isValidGitHubUrl(repoUrl)) {
    logger.error(`❌ Invalid GitHub URL: ${repoUrl}`);
    process.exit(1);
  }

  logger.info(`📤 Testing with repository: ${repoUrl}`);
  logger.info('');

  try {
    // Step 2: Check Redis connection
    logger.info('1️⃣  Checking Redis connection...');
    try {
      const waiting = await repoQueue.getWaiting();
      logger.info(`✅ Redis connected (${waiting.length} jobs waiting)`);
    } catch (error: any) {
      logger.error(`❌ Redis connection failed: ${error.message}`);
      logger.error(
        '   Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_TLS environment variables'
      );
      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(1);
    }
    logger.info('');

    // Step 3: Check current queue status
    logger.info('2️⃣  Current queue status:');
    const waiting = await repoQueue.getWaiting();
    const active = await repoQueue.getActive();
    const completed = await repoQueue.getCompleted();
    const failed = await repoQueue.getFailed();

    logger.info(`   Waiting: ${waiting.length}`);
    logger.info(`   Active: ${active.length}`);
    logger.info(`   Completed: ${completed.length}`);
    logger.info(`   Failed: ${failed.length}`);
    logger.info('');

    // Step 4: Add repository to queue
    logger.info('3️⃣  Adding repository to queue...');
    const normalizedUrl = normalizeRepoUrl(repoUrl);

    let dbRepository = await prisma.repository.findUnique({
      where: { url: normalizedUrl },
    });

    if (!dbRepository) {
      const repoName =
        normalizedUrl.split('/').pop()?.replace('.git', '') || 'default_repo';
      dbRepository = await prisma.repository.create({
        data: {
          url: normalizedUrl,
          pathName: repoName,
          state: 'pending',
          lastAttempt: new Date(),
        },
      });
      logger.info(`✅ Created repository record: ${dbRepository.id}`);
    } else {
      logger.info(
        `ℹ️  Repository already exists: ${dbRepository.id} (state: ${dbRepository.state})`
      );

      // Reset to pending if it's failed
      if (dbRepository.state === 'failed') {
        dbRepository = await prisma.repository.update({
          where: { id: dbRepository.id },
          data: { state: 'pending', lastAttempt: new Date() },
        });
        logger.info(`🔄 Reset repository state to pending`);
      }
    }

    // Get token from environment
    const token = process.env.GITHUB_TOKEN || null;

    // Add to queue
    const job = await repoQueue.add({ dbRepository, token });
    logger.info(`✅ Added to queue: ${dbRepository.url}`);
    logger.info(`   Job ID: ${job.id}`);
    logger.info(`   Repository ID: ${dbRepository.id}`);
    logger.info(`   State: ${dbRepository.state}`);
    logger.info(
      `   Token: ${token ? 'Provided' : 'Not provided (public repos only)'}`
    );
    logger.info('');

    // Step 5: Show updated queue status
    logger.info('4️⃣  Updated queue status:');
    const newWaiting = await repoQueue.getWaiting();
    const newActive = await repoQueue.getActive();
    logger.info(`   Waiting: ${newWaiting.length}`);
    logger.info(`   Active: ${newActive.length}`);
    logger.info('');

    // Step 6: Instructions
    logger.info('5️⃣  Next steps:');
    logger.info('   To process this job, run one of:');
    logger.info('   - Local worker:     npm run dev:worker');
    logger.info('   - Cloud Run worker:  npm run dev:cloudrun-worker');
    logger.info(
      '   - Check status:     npm run check-queue (or npx ts-node scripts/checkQueueStatus.ts)'
    );
    logger.info('');

    await prisma.$disconnect();
    await repoQueue.close();

    logger.info('✅ Test repository added successfully!');
    process.exit(0);
  } catch (error: any) {
    logger.error(`❌ Error: ${error.message}`);
    logger.error(error.stack);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

testWorker();
