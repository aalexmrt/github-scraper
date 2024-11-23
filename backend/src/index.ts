import fastify from 'fastify';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { processRepository, generateLeaderboard } from './services/repoService';

dotenv.config();

const app = fastify();

app.get('/leaderboard', async (request, reply) => {
  const { repoUrl } = request.query as { repoUrl?: string };

  if (!repoUrl) {
    return reply.status(400).send({ error: 'repoUrl query parameter is required' });
  }

  try {
    const message = await processRepository(repoUrl);
    const leaderboard = await generateLeaderboard(repoUrl);
    reply.send({  leaderboard });
    reply.send({ message });
  } catch (error:any) {
    reply.status(500).send({ error: error.message });
  }
});

// Hook to disconnect Prisma when the server shuts down
app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

// Start the server
const startServer = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server is running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
