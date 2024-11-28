-- CreateTable
CREATE TABLE "Repository" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "lastAttempt" TIMESTAMP(3),
    "lastProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryContributor" (
    "id" SERIAL NOT NULL,
    "repositoryId" INTEGER NOT NULL,
    "contributorId" INTEGER NOT NULL,
    "commitCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepositoryContributor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_url_key" ON "Repository"("url");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryContributor_repositoryId_contributorId_key" ON "RepositoryContributor"("repositoryId", "contributorId");

-- AddForeignKey
ALTER TABLE "RepositoryContributor" ADD CONSTRAINT "RepositoryContributor_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryContributor" ADD CONSTRAINT "RepositoryContributor_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
