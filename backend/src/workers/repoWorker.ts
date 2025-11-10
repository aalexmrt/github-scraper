import { repoQueue } from '../services/queueService';
import { syncRepository, generateLeaderboard } from '../services/repoService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';
import { getVersion } from '../utils/version';

// Log version on worker startup
const version = getVersion();
logger.info('[WORKER] Starting continuous worker...');
logger.info(`[WORKER] Worker Version: ${version}`);

repoQueue.process(async (job) => {
  const { dbRepository, token = null } = job.data;

  try {
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: { state: 'in_progress', lastAttempt: new Date() },
    });

    await syncRepository(dbRepository, token);
    await generateLeaderboard(dbRepository);

    // Update repository state - always completed since we don't make API calls
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: {
        state: 'completed',
        lastProcessedAt: new Date(),
      },
    });

    logger.info(
      `Repository ${dbRepository.url} processed successfully. Contributors created with email-only data (no API calls made).`
    );

    return `Repository ${dbRepository.url} processed successfully at ${dbRepository.lastProcessedAt}`;
  } catch (error: any) {
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: { state: 'failed' },
    });
    logger.error(
      `Failed to process repository ${dbRepository.url}: ${error.message}`
    );
    throw error; // Ensures the job is marked as failed
  }
});
