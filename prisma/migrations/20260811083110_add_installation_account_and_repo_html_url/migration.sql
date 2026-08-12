/*
  Warnings:

  - The `severity` column on the `ReviewComment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "Installation" ADD COLUMN     "accountAvatarUrl" TEXT,
ADD COLUMN     "accountLogin" TEXT;

-- AlterTable
ALTER TABLE "PullRequest" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "lastDeliveryId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "htmlUrl" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "errorMessage" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ReviewComment" ADD COLUMN     "category" TEXT,
ADD COLUMN     "githubCommentId" BIGINT,
ADD COLUMN     "postedToGithub" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "severity",
ADD COLUMN     "severity" "Severity";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "password" TEXT,
ALTER COLUMN "githubId" DROP NOT NULL,
ALTER COLUMN "githubLogin" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Installation_userId_idx" ON "Installation"("userId");

-- CreateIndex
CREATE INDEX "PrFile_pullRequestId_idx" ON "PrFile"("pullRequestId");

-- CreateIndex
CREATE INDEX "PullRequest_repositoryId_idx" ON "PullRequest"("repositoryId");

-- CreateIndex
CREATE INDEX "Repository_installationId_idx" ON "Repository"("installationId");

-- CreateIndex
CREATE INDEX "Review_pullRequestId_idx" ON "Review"("pullRequestId");

-- CreateIndex
CREATE INDEX "ReviewComment_reviewId_idx" ON "ReviewComment"("reviewId");
