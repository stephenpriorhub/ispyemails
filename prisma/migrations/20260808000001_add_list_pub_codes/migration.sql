-- Add internal pub codes to List (links iSpy lists to internal MTA email lists for MTATRIX)
ALTER TABLE "List" ADD COLUMN "editorialPubCode" TEXT;
ALTER TABLE "List" ADD COLUMN "dedicatedPubCode" TEXT;
