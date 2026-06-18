-- Backfill migration: these columns were added to model List in the Prisma
-- schema (commit 5deec6f) but never had a corresponding migration, so they
-- are missing from any database whose schema is driven purely by migrations
-- (e.g. production). Idempotent so it is safe regardless of current state.

-- AlterTable
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "isIgnored" BOOLEAN NOT NULL DEFAULT false;
