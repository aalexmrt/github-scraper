/*
  Warnings:

  - You are about to drop the column `email` on the `Contributor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[identifier]` on the table `Contributor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `identifier` to the `Contributor` table without a default value. This is not possible if the table is not empty.
  - Made the column `username` on table `Contributor` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Contributor_email_key";

-- AlterTable
ALTER TABLE "Contributor" DROP COLUMN "email",
ADD COLUMN     "emails" TEXT[],
ADD COLUMN     "identifier" TEXT NOT NULL,
ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_identifier_key" ON "Contributor"("identifier");
