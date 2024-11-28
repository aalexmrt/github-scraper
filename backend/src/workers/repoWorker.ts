import { repoQueue } from '../services/queueService';
import { processRepository, generateLeaderboard } from '../services/repoService';
import prisma from '../utils/prisma';
console.log('Worker started, listening for repository processing jobs...');

repoQueue.process(async (job) => {
  const { dbRepository } = job.data;

  try {
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: { state: 'in_progress', lastAttempt: new Date() },
    });
    const message = await processRepository(dbRepository);
    const leaderboard = await generateLeaderboard(dbRepository);

    // Update repository state to completed
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: {
        state: 'completed',
        lastProcessedAt: new Date(),
      },
    });

    console.log(`Repository processed: ${message}`);
    return leaderboard;
  } catch (error: any) {
    await prisma.repository.update({
      where: { id: dbRepository.id },
      data: { state: 'failed' },
    });
    console.error(`Failed to process repository ${dbRepository.url}: ${error.message}`);
    throw error; // Ensures the job is marked as failed
  }
});
