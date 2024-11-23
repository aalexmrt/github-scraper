/*
  Warnings:

  - You are about to drop the column `commitCount` on the `Contributor` table. All the data in the column will be lost.
  - You are about to drop the column `emails` on the `Contributor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[username]` on the table `Contributor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `Contributor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Contributor` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Contributor" DROP COLUMN "commitCount",
DROP COLUMN "emails",
ADD COLUMN     "email" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_username_key" ON "Contributor"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_email_key" ON "Contributor"("email");
