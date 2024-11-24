import { repoQueue } from '../services/queueService';
import { processRepository, generateLeaderboard } from '../services/repoService';

console.log('Worker started, listening for repository processing jobs...');

repoQueue.process(async (job) => {
  const { repoUrl } = job.data;
  console.log(`Processing repository: ${repoUrl}`);
  try {
    const message = await processRepository(repoUrl);
    const leaderboard = await generateLeaderboard(repoUrl);
    console.log(`Repository processed: ${message}`);
    return { status: 'success', leaderboard };
  } catch (error: any) {
    console.error(`Failed to process repository ${repoUrl}: ${error.message}`);
    throw error; // Ensures the job is marked as failed
  }
});
