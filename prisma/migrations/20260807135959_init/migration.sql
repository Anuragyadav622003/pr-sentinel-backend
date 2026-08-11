-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrFile" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "patch" TEXT,
    "additions" INTEGER NOT NULL,
    "deletions" INTEGER NOT NULL,

    CONSTRAINT "PrFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PrFile" ADD CONSTRAINT "PrFile_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
