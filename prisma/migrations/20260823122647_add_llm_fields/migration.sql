/*
  Warnings:

  - You are about to alter the column `githubPrNumber` on the `PullRequest` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('OPENROUTER', 'OPENAI', 'GEMINI', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "LlmMode" AS ENUM ('FREE', 'BYOK');

-- AlterTable
ALTER TABLE "PullRequest" ALTER COLUMN "githubPrNumber" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "llmMode" "LlmMode" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "UserLlmConfig" (
    "id" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLlmConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLlmConfig_userId_provider_key" ON "UserLlmConfig"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserLlmConfig" ADD CONSTRAINT "UserLlmConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
