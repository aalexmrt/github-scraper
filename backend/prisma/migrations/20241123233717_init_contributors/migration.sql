-- DropIndex
DROP INDEX "Contributor_username_key";

-- AlterTable
ALTER TABLE "Contributor" ALTER COLUMN "username" DROP NOT NULL;
