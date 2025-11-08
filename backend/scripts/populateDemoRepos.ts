import dotenv from 'dotenv';
import { populateDemoRepos } from '../src/utils/populateDemoRepos';
import prisma from '../src/utils/prisma';
import { repoQueue } from '../src/services/queueService';

dotenv.config();

async function main() {
  try {
    const result = await populateDemoRepos({ silent: false });
    
    // Close Prisma connection
    await prisma.$disconnect();
    
    // Close Redis connection
    await repoQueue.close();

    process.exit(result.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error);
    await prisma.$disconnect();
    await repoQueue.close();
    process.exit(1);
  }
}

main();
