-- AlterTable
ALTER TABLE "Learning" ADD COLUMN     "appendedAt" TIMESTAMP(3),
ADD COLUMN     "appendedToBrain" BOOLEAN NOT NULL DEFAULT false;
