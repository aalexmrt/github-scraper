/*
  Warnings:

  - You are about to drop the column `identifier` on the `Contributor` table. All the data in the column will be lost.
  - Added the required column `pathName` to the `Repository` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Contributor_email_key";

-- DropIndex
DROP INDEX "Contributor_identifier_key";

-- AlterTable
ALTER TABLE "Contributor" DROP COLUMN "identifier",
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "pathName" TEXT NOT NULL;
