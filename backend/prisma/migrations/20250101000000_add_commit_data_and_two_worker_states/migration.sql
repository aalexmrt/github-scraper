-- CreateTable
CREATE TABLE "CommitData" (
    "id" SERIAL NOT NULL,
    "repositoryId" INTEGER NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommitData_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN "commitsProcessedAt" TIMESTAMP(3),
ADD COLUMN "usersProcessedAt" TIMESTAMP(3),
ADD COLUMN "totalCommits" INTEGER,
ADD COLUMN "uniqueContributors" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CommitData_repositoryId_authorEmail_key" ON "CommitData"("repositoryId", "authorEmail");

-- CreateIndex
CREATE INDEX "CommitData_repositoryId_processed_idx" ON "CommitData"("repositoryId", "processed");

-- AddForeignKey
ALTER TABLE "CommitData" ADD CONSTRAINT "CommitData_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;








