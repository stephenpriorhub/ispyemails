/*
  Warnings:

  - You are about to drop the column `bio` on the `Guru` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Guru" DROP COLUMN "bio",
ADD COLUMN     "isSecondaryVoice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SecondaryVoiceGuru" (
    "secondaryVoiceId" TEXT NOT NULL,
    "primaryGuruId" TEXT NOT NULL,

    CONSTRAINT "SecondaryVoiceGuru_pkey" PRIMARY KEY ("secondaryVoiceId","primaryGuruId")
);

-- AddForeignKey
ALTER TABLE "SecondaryVoiceGuru" ADD CONSTRAINT "SecondaryVoiceGuru_secondaryVoiceId_fkey" FOREIGN KEY ("secondaryVoiceId") REFERENCES "Guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecondaryVoiceGuru" ADD CONSTRAINT "SecondaryVoiceGuru_primaryGuruId_fkey" FOREIGN KEY ("primaryGuruId") REFERENCES "Guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;
