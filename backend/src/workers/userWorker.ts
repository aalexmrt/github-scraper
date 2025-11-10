import { userQueue } from '../services/queueService';
import { batchProcessUsers } from '../services/userService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

// Log version on worker startup
const version = getVersion();
logger.info('[USER_WORKER] Starting user worker...');
logger.info(`[USER_WORKER] Worker Version: ${version}`);

userQueue.process('user_processing', async (job) => {
  const { repositoryId, emails, token } = job.data;

  try {
    logger.info(
      `[USER_WORKER] Processing ${emails.length} emails for repository ${repositoryId}`
    );

    // Process batch of emails
    const results = await batchProcessUsers(repositoryId, emails, token);

    // Update CommitData records as processed
    await prisma.commitData.updateMany({
      where: {
        repositoryId,
        authorEmail: { in: emails },
      },
      data: { processed: true },
    });

    logger.info(
      `[USER_WORKER] Marked ${emails.length} commit data records as processed for repository ${repositoryId}`
    );

    // Check if all commits for this repo are processed
    const remainingUnprocessed = await prisma.commitData.count({
      where: {
        repositoryId,
        processed: false,
      },
    });

    if (remainingUnprocessed === 0) {
      // All users processed, update repository state
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          state: 'completed',
          usersProcessedAt: new Date(),
          lastProcessedAt: new Date(),
        },
      });

      logger.info(
        `[USER_WORKER] Completed all user processing for repository ${repositoryId}`
      );
    } else {
      logger.info(
        `[USER_WORKER] Repository ${repositoryId} still has ${remainingUnprocessed} unprocessed contributors`
      );
    }

    return {
      success: true,
      processed: results.processed,
      rateLimitHit: results.rateLimitHit,
      remainingUnprocessed,
    };
  } catch (error: any) {
    logger.error(
      `[USER_WORKER] Failed to process users for repository ${repositoryId}: ${error.message}`
    );

    // Don't mark repo as failed, just log - other batches might succeed
    // The repo will remain in 'users_processing' state
    throw error; // Ensures the job is marked as failed and can be retried
  }
});



