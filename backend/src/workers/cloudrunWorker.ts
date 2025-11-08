import { repoQueue } from '../services/queueService';
import { syncRepository, generateLeaderboard } from '../services/repoService';
import prisma from '../utils/prisma';

/**
 * Cloud Run Jobs-compatible worker
 * Processes ONE job from the queue and exits (no continuous polling)
 */
async function processOneJob() {
  try {
    // Get waiting jobs from the queue
    const waitingJobs = await repoQueue.getWaiting();
    
    if (waitingJobs.length === 0) {
      console.log('[WORKER] No jobs in queue, exiting gracefully');
      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(0);
    }

    // Process the first waiting job
    const job = waitingJobs[0];
    console.log(`[WORKER] Processing job ${job.id} for repository: ${job.data.dbRepository.url}`);
    
    const { dbRepository, token = null } = job.data;

    try {
      await prisma.repository.update({
        where: { id: dbRepository.id },
        data: { state: 'in_progress', lastAttempt: new Date() },
      });

      await syncRepository(dbRepository, token);
      await generateLeaderboard(dbRepository, token);

      // Update repository state to completed
      await prisma.repository.update({
        where: { id: dbRepository.id },
        data: {
          state: 'completed',
          lastProcessedAt: new Date(),
        },
      });

      await job.remove(); // Remove completed job from queue
      console.log(`[WORKER] Successfully processed repository ${dbRepository.url}`);
      
      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(0);
    } catch (error: any) {
      await prisma.repository.update({
        where: { id: dbRepository.id },
        data: { state: 'failed' },
      });
      
      console.error(
        `[WORKER] Failed to process repository ${dbRepository.url}: ${error.message}`
      );
      
      // Move job to failed state (Bull will handle retries if configured)
      await job.moveToFailed(error as Error, job.token);
      
      await prisma.$disconnect();
      await repoQueue.close();
      process.exit(1);
    }
  } catch (error: any) {
    console.error('[WORKER] Error getting job from queue:', error.message);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

// Run migrations first, then process one job
async function main() {
  try {
    console.log('[WORKER] Running database migrations...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[WORKER] Migrations completed');
    
    console.log('[WORKER] Starting job processing...');
    await processOneJob();
  } catch (error: any) {
    console.error('[WORKER] Fatal error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();

