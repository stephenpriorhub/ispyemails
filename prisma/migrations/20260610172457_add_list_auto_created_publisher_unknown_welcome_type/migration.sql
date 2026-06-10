-- AlterEnum
ALTER TYPE "EmailType" ADD VALUE 'WELCOME';

-- AlterEnum
ALTER TYPE "PublisherType" ADD VALUE 'UNKNOWN';

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "autoCreated" BOOLEAN NOT NULL DEFAULT false;
