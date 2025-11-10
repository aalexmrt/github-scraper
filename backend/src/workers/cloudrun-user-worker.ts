import { userQueue, waitForQueueReady } from '../services/queueService';
import '../workers/user-worker'; // Import to register the processor
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

/**
 * Cloud Run Jobs-compatible user worker
 * Processes multiple user jobs from the queue per execution (configurable)
 * Processes jobs in parallel batches for better throughput while staying within free tier limits
 */
const MAX_JOBS_PER_EXECUTION = parseInt(
  process.env.MAX_JOBS_PER_EXECUTION || '50',
  10
); // Process up to 50 jobs per execution (configurable)

const MAX_CONCURRENT_JOBS = parseInt(
  process.env.MAX_CONCURRENT_JOBS || '10',
  10
); // Process up to 10 jobs concurrently (configurable)

async function processUserJobs() {
  try {
    // Wait for Redis connection to be ready before proceeding
    logger.info('[USER_WORKER] Waiting for Redis connection to be ready...');
    await waitForQueueReady(userQueue, 10, 2000);
    logger.info('[USER_WORKER] Redis connection ready');

    // First, check for stuck active jobs (jobs that were interrupted)
    let activeJobs: any[] = [];
    try {
      activeJobs = await userQueue.getActive();
    } catch (error: any) {
      logger.error(`[USER_WORKER] Failed to get active jobs: ${error.message}`);
      // Continue anyway - might be a transient connection issue
    }
    if (activeJobs.length > 0) {
      logger.warn(
        `[USER_WORKER] Found ${activeJobs.length} stuck active job(s), cleaning up...`
      );
      for (const job of activeJobs) {
        try {
          await job.remove();
          logger.info(
            `[USER_WORKER] Removed stuck active job ${job.id} (repository: ${job.data.repositoryId || 'N/A'})`
          );
        } catch (error: any) {
          logger.error(
            `[USER_WORKER] Failed to remove stuck job ${job.id}: ${error.message}`
          );
        }
      }
    }

    // Get waiting jobs from the queue
    let waitingJobs: any[] = [];
    try {
      waitingJobs = await userQueue.getWaiting();
    } catch (error: any) {
      logger.error(
        `[USER_WORKER] Failed to get waiting jobs: ${error.message}`
      );
      throw new Error(`Redis connection error: ${error.message}`);
    }

    if (waitingJobs.length === 0) {
      logger.info('[USER_WORKER] No jobs in queue, exiting gracefully');
      await prisma.$disconnect();
      await userQueue.close();
      process.exit(0);
    }

    // Process up to MAX_JOBS_PER_EXECUTION jobs
    const jobsToProcess = waitingJobs.slice(0, MAX_JOBS_PER_EXECUTION);
    logger.info(
      `[USER_WORKER] Processing ${jobsToProcess.length} job(s) in parallel batches (max per execution: ${MAX_JOBS_PER_EXECUTION}, concurrent: ${MAX_CONCURRENT_JOBS}, total waiting: ${waitingJobs.length})`
    );

    let processedCount = 0;
    let failedCount = 0;

    // Process jobs in parallel batches with concurrency limit
    const processJob = async (job: any, index: number): Promise<void> => {
      logger.info(
        `[USER_WORKER] [${index + 1}/${jobsToProcess.length}] Starting job ${job.id} for repository: ${job.data.repositoryId} (${job.data.emails.length} emails)`
      );

      try {
        // Wait for the processor to pick up the job (it should happen automatically)
        // Give it a moment for the processor to start
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if job is already active (processor picked it up)
        // Bull processors should automatically pick up waiting jobs
        let checkCount = 0;
        const maxChecks = 30; // Wait up to 30 seconds for processor to pick up job
        let jobState = 'waiting';

        while (checkCount < maxChecks) {
          const currentJob = await userQueue.getJob(job.id);
          if (!currentJob) {
            throw new Error(`Job ${job.id} not found`);
          }

          jobState = await currentJob.getState();
          if (
            jobState === 'active' ||
            jobState === 'completed' ||
            jobState === 'failed'
          ) {
            logger.info(`[USER_WORKER] Job ${job.id} is now ${jobState}`);
            break;
          }

          if (checkCount % 5 === 0) {
            logger.info(
              `[USER_WORKER] Waiting for job ${job.id} to be picked up by processor (state: ${jobState}, attempt ${checkCount + 1}/${maxChecks})...`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          checkCount++;
        }

        if (jobState === 'waiting' || jobState === 'delayed') {
          logger.error(
            `[USER_WORKER] Job ${job.id} was never picked up by processor (final state: ${jobState})`
          );
          throw new Error(
            `Job ${job.id} was not processed (state: ${jobState})`
          );
        }

        // The job will be processed by the userQueue.process handler
        // We just need to wait for it to complete
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Job processing timeout after 10 minutes'));
          }, 600000); // 10 minute timeout per job

          job
            .finished()
            .then(() => {
              clearTimeout(timeout);
              resolve();
            })
            .catch((error: any) => {
              clearTimeout(timeout);
              reject(error);
            });
        });

        await job.remove(); // Remove completed job from queue
        processedCount++;
        logger.info(
          `[USER_WORKER] ✅ Successfully processed job ${job.id} (${processedCount}/${jobsToProcess.length} completed)`
        );
      } catch (error: any) {
        failedCount++;
        logger.error(
          `[USER_WORKER] ❌ Failed to process job ${job.id}: ${error.message}`
        );
        // Continue with next job instead of failing completely
      }
    };

    // Process jobs in parallel batches with concurrency limit
    const processBatch = async (jobs: any[], startIndex: number) => {
      const batchPromises = jobs.map((job, batchIndex) =>
        processJob(job, startIndex + batchIndex)
      );
      await Promise.all(batchPromises);
    };

    // Process all jobs in batches of MAX_CONCURRENT_JOBS
    for (let i = 0; i < jobsToProcess.length; i += MAX_CONCURRENT_JOBS) {
      const batch = jobsToProcess.slice(i, i + MAX_CONCURRENT_JOBS);
      logger.info(
        `[USER_WORKER] Processing batch ${Math.floor(i / MAX_CONCURRENT_JOBS) + 1} (${batch.length} jobs concurrently)`
      );
      await processBatch(batch, i);
    }

    logger.info(
      `[USER_WORKER] ✅ Batch complete! Processed: ${processedCount}, Failed: ${failedCount}, Remaining in queue: ${Math.max(0, waitingJobs.length - jobsToProcess.length)}`
    );

    await prisma.$disconnect();
    await userQueue.close();
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (error: any) {
    logger.error('[USER_WORKER] Error processing job:', error.message);
    await prisma.$disconnect();
    await userQueue.close();
    process.exit(1);
  }
}

// Run migrations first, then process jobs
async function main() {
  try {
    const version = getVersion();
    console.log('[USER_WORKER] Starting Cloud Run user worker...');
    console.log(`[USER_WORKER] Worker Version: ${version}`);

    logger.info('[USER_WORKER] Running database migrations...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('[USER_WORKER] Migrations completed');

    logger.info(
      `[USER_WORKER] Starting job processing (max ${MAX_JOBS_PER_EXECUTION} jobs per execution, ${MAX_CONCURRENT_JOBS} concurrent)...`
    );
    await processUserJobs();
  } catch (error: any) {
    logger.error('[USER_WORKER] Fatal error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
