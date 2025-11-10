import { commitQueue, enqueueUserJob } from '../services/queueService';
import { syncRepository, processCommits } from '../services/repoService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

// Log version on worker startup
const version = getVersion();
logger.info('[COMMIT_WORKER] Starting commit worker...');
logger.info(`[COMMIT_WORKER] Worker Version: ${version}`);

commitQueue.process('commit_processing', async (job) => {
  const { repositoryId, url, pathName, token } = job.data;

  try {
    // Update state: pending → commits_processing
    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        state: 'commits_processing',
        lastAttempt: new Date(),
      },
    });

    logger.info(
      `[COMMIT_WORKER] Processing commits for repository ${url} (ID: ${repositoryId})`
    );

    // Step 1: Get repository from database
    const dbRepository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!dbRepository) {
      throw new Error(`Repository ${repositoryId} not found in database`);
    }

    // Step 2: Clone/Fetch repository
    await syncRepository(dbRepository, token);
    logger.info(`[COMMIT_WORKER] Repository ${url} synced successfully`);

    // Step 3: Process commits and extract email data
    const commitData = await processCommits(dbRepository);
    logger.info(
      `[COMMIT_WORKER] Found ${commitData.length} unique contributors with ${commitData.reduce((sum, d) => sum + d.count, 0)} total commits`
    );

    // Step 4: Save commit data to CommitData table
    await prisma.$transaction(
      commitData.map(({ email, count }) =>
        prisma.commitData.upsert({
          where: {
            repositoryId_authorEmail: {
              repositoryId,
              authorEmail: email,
            },
          },
          update: { commitCount: count },
          create: {
            repositoryId,
            authorEmail: email,
            commitCount: count,
            processed: false,
          },
        })
      )
    );

    logger.info(
      `[COMMIT_WORKER] Saved ${commitData.length} commit data records`
    );

    // Step 5: Update repository with commit stats
    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        state: 'users_processing',
        commitsProcessedAt: new Date(),
        totalCommits: commitData.reduce((sum, d) => sum + d.count, 0),
        uniqueContributors: commitData.length,
      },
    });

    // Step 6: Enqueue user lookup jobs (batch emails)
    const BATCH_SIZE = 50; // Process 50 emails per user job
    const emails = commitData.map((d) => d.email);
    const batches: string[][] = [];

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      batches.push(emails.slice(i, i + BATCH_SIZE));
    }

    logger.info(
      `[COMMIT_WORKER] Enqueueing ${batches.length} user processing job(s) for ${emails.length} emails`
    );

    for (const batch of batches) {
      await enqueueUserJob(repositoryId, batch, token);
    }

    logger.info(
      `[COMMIT_WORKER] Successfully processed commits for repository ${url}. ${batches.length} user job(s) enqueued.`
    );

    return {
      success: true,
      contributors: commitData.length,
      totalCommits: commitData.reduce((sum, d) => sum + d.count, 0),
      userJobsEnqueued: batches.length,
    };
  } catch (error: any) {
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { state: 'failed' },
    });
    logger.error(
      `[COMMIT_WORKER] Failed to process commits for repository ${url}: ${error.message}`
    );
    throw error; // Ensures the job is marked as failed
  }
});
