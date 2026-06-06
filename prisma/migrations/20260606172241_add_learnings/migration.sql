-- CreateEnum
CREATE TYPE "LearningSource" AS ENUM ('AI_EMAIL', 'USER_ACTION');

-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('PENDING', 'VALIDATED', 'IGNORED');

-- CreateEnum
CREATE TYPE "LearningCategory" AS ENUM ('GURU', 'PUBLISHER', 'LIST', 'TOPIC', 'GENERAL');

-- CreateTable
CREATE TABLE "Learning" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" "LearningSource" NOT NULL,
    "category" "LearningCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "LearningStatus" NOT NULL DEFAULT 'PENDING',
    "emailId" TEXT,
    "guruId" TEXT,
    "publisherId" TEXT,
    "listId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Learning_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Learning" ADD CONSTRAINT "Learning_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learning" ADD CONSTRAINT "Learning_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learning" ADD CONSTRAINT "Learning_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learning" ADD CONSTRAINT "Learning_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE SET NULL ON UPDATE CASCADE;
