/*
  Warnings:

  - You are about to drop the column `logoUrl` on the `Publisher` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PublisherType" AS ENUM ('INTERNAL', 'COMPETITOR', 'AFFILIATE_MARKETER');

-- CreateEnum
CREATE TYPE "ListCategory" AS ENUM ('FREE_EDITORIAL', 'PAID_EDITORIAL', 'HOTLIST', 'MARKETING_FILE');

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "listConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listId" TEXT;

-- AlterTable
ALTER TABLE "Publisher" DROP COLUMN "logoUrl",
ADD COLUMN     "type" "PublisherType" NOT NULL DEFAULT 'COMPETITOR';

-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ListCategory" NOT NULL DEFAULT 'FREE_EDITORIAL',
    "publisherId" TEXT,
    "notes" TEXT,
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guru" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "notes" TEXT,
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuruList" (
    "guruId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GuruList_pkey" PRIMARY KEY ("guruId","listId")
);

-- CreateTable
CREATE TABLE "EmailGuru" (
    "emailId" TEXT NOT NULL,
    "guruId" TEXT NOT NULL,

    CONSTRAINT "EmailGuru_pkey" PRIMARY KEY ("emailId","guruId")
);

-- CreateIndex
CREATE UNIQUE INDEX "List_name_key" ON "List"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Guru_name_key" ON "Guru"("name");

-- CreateIndex
CREATE INDEX "Email_listId_idx" ON "Email"("listId");

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuruList" ADD CONSTRAINT "GuruList_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuruList" ADD CONSTRAINT "GuruList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailGuru" ADD CONSTRAINT "EmailGuru_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailGuru" ADD CONSTRAINT "EmailGuru_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;
