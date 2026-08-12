-- DropForeignKey
ALTER TABLE "Installation" DROP CONSTRAINT "Installation_userId_fkey";

-- AlterTable
ALTER TABLE "Installation" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
