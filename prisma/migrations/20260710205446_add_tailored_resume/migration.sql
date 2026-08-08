-- CreateTable
CREATE TABLE "TailoredResume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resumeId" TEXT NOT NULL,
    "jobDescId" TEXT NOT NULL,
    "structuredJson" TEXT NOT NULL,
    "changesJson" TEXT NOT NULL,
    "gapsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TailoredResume_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TailoredResume_jobDescId_fkey" FOREIGN KEY ("jobDescId") REFERENCES "JobDesc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TailoredResume_resumeId_idx" ON "TailoredResume"("resumeId");

-- CreateIndex
CREATE INDEX "TailoredResume_jobDescId_idx" ON "TailoredResume"("jobDescId");
