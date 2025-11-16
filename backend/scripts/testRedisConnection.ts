#!/usr/bin/env node
/**
 * Test Redis Connection
 * Verifies Redis connection settings and connectivity
 */

import { repoQueue } from '../src/services/queueService';
import { logger } from '../src/utils/logger';

async function testRedisConnection() {
  try {
    logger.info('🔍 Testing Redis connection...\n');

    // Test basic connection
    logger.info('1. Testing queue connection...');
    const waiting = await repoQueue.getWaiting();
    logger.info(`   ✅ Connected! Found ${waiting.length} waiting jobs\n`);

    // Test active jobs
    logger.info('2. Checking active jobs...');
    const active = await repoQueue.getActive();
    logger.info(`   Active jobs: ${active.length}\n`);

    // Test failed jobs
    logger.info('3. Checking failed jobs...');
    const failed = await repoQueue.getFailed();
    logger.info(`   Failed jobs: ${failed.length}\n`);

    // Test adding a job (without actually adding)
    logger.info('4. Testing job creation capability...');
    const testJob = await repoQueue.add(
      { dbRepository: { id: 0, url: 'test', pathName: 'test', state: 'pending' }, token: null },
      { removeOnComplete: true, removeOnFail: true }
    );
    await testJob.remove();
    logger.info('   ✅ Can create and remove jobs\n');

    logger.info('✅ Redis connection test PASSED!\n');
    logger.info('Configuration:');
    logger.info(`   Host: ${process.env.REDIS_HOST || 'localhost'}`);
    logger.info(`   Port: ${process.env.REDIS_PORT || '6379'}`);
    logger.info(`   TLS: ${process.env.REDIS_TLS || 'false'}`);
    logger.info(`   Password: ${process.env.REDIS_PASSWORD ? '***set***' : 'not set'}\n`);

    await repoQueue.close();
    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Redis connection test FAILED!\n');
    logger.error('Error:', error.message);
    logger.error('\nTroubleshooting:');
    logger.error('1. Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD env vars');
    logger.error('2. Verify Redis/Upstash is accessible');
    logger.error('3. Check firewall/network settings');
    logger.error('4. Verify TLS is enabled if using Upstash\n');

    await repoQueue.close();
    process.exit(1);
  }
}

testRedisConnection();








