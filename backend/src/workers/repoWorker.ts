import { repoQueue } from '../services/queueService';
import { syncRepository, generateLeaderboard } from '../services/repoService';
import prisma from '../utils/prisma';

repoQueue.process(async (job) => {
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

    return `Repository ${dbRepository.url} processed successfully at ${dbRepository.lastProcessedAt}`;
  } catch (error: any) {
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: { state: 'failed' },
    });
    console.error(
      `Failed to process repository ${dbRepository.url}: ${error.message}`
    );
    throw error; // Ensures the job is marked as failed
  }
});
