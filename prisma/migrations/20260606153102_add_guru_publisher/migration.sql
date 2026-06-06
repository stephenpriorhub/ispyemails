-- AlterTable
ALTER TABLE "Guru" ADD COLUMN     "publisherId" TEXT;

-- AddForeignKey
ALTER TABLE "Guru" ADD CONSTRAINT "Guru_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
