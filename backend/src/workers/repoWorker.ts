import { repoQueue } from '../services/queueService';
import { syncRepository, generateLeaderboard } from '../services/repoService';
import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

repoQueue.process(async (job) => {
  const { dbRepository, token = null } = job.data;

  try {
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: { state: 'in_progress', lastAttempt: new Date() },
    });

    await syncRepository(dbRepository, token);
    const { rateLimitHit } = await generateLeaderboard(dbRepository, token);

    // Update repository state based on whether rate limit was hit
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: {
        state: rateLimitHit ? 'completed_partial' : 'completed',
        lastProcessedAt: new Date(),
      },
    });

    if (rateLimitHit) {
      logger.warn(
        `Repository ${dbRepository.url} completed partially due to rate limit. Some contributors may have email-only data.`
      );
    }

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
