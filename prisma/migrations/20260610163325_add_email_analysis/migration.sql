-- CreateTable
CREATE TABLE "EmailAnalysis" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,
    "complianceRisk" TEXT NOT NULL DEFAULT 'NONE',
    "mtaOverlap" TEXT NOT NULL DEFAULT 'LOW',
    "notableFor" TEXT,
    "modelUsed" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAnalysis_emailId_key" ON "EmailAnalysis"("emailId");

-- AddForeignKey
ALTER TABLE "EmailAnalysis" ADD CONSTRAINT "EmailAnalysis_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
