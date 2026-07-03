-- CreateTable
CREATE TABLE "GuruSecondaryPublisher" (
    "guruId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuruSecondaryPublisher_pkey" PRIMARY KEY ("guruId","publisherId")
);

-- AddForeignKey
ALTER TABLE "GuruSecondaryPublisher" ADD CONSTRAINT "GuruSecondaryPublisher_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuruSecondaryPublisher" ADD CONSTRAINT "GuruSecondaryPublisher_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
