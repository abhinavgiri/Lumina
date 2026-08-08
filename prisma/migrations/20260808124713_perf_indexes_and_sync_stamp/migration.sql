-- AlterTable
ALTER TABLE "CareerProfile" ADD COLUMN "skillsSyncedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Application_userId_updatedAt_idx" ON "Application"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AtsReport_resumeId_createdAt_idx" ON "AtsReport"("resumeId", "createdAt");

-- CreateIndex
CREATE INDEX "Resume_userId_createdAt_idx" ON "Resume"("userId", "createdAt");
