-- AlterTable
ALTER TABLE "JobSearch" ADD COLUMN "lastError" TEXT;
ALTER TABLE "JobSearch" ADD COLUMN "lastJobCount" INTEGER;
ALTER TABLE "JobSearch" ADD COLUMN "lastRunAt" DATETIME;
ALTER TABLE "JobSearch" ADD COLUMN "lastStatus" TEXT;
