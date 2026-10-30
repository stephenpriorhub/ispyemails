-- Same promo reached by many per-send URLs, and admin "not a promo" removals that stick.

ALTER TABLE "Promo" ADD COLUMN IF NOT EXISTS "contentKey" TEXT;

CREATE INDEX IF NOT EXISTS "Promo_contentKey_idx" ON "Promo"("contentKey");

CREATE TABLE IF NOT EXISTS "PromoBlock" (
    "id" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "label" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoBlock_matchKey_key" ON "PromoBlock"("matchKey");
