import Queue from 'bull';

const repoQueue = new Queue('repo-queue');

repoQueue.process(async (job) => {
  const { repoUrl, localPath } = job.data;
  // Call the repository cloning function here
  console.log(`Processing: ${repoUrl}`);
});

export const addToQueue = (repoUrl: string, localPath: string) => {
  repoQueue.add({ repoUrl, localPath });
};
