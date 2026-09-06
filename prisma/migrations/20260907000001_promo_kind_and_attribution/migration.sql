-- Classify promos (VSL / lead-gen / equity raise) and allow per-promo advertiser
-- attribution for pages hosted on a platform domain that names no advertiser.

ALTER TABLE "PromoAdvertiser" ADD COLUMN "isPlatform" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Promo" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'VSL';
ALTER TABLE "Promo" ADD COLUMN "advertiserLabel" TEXT;

CREATE INDEX "Promo_kind_idx" ON "Promo"("kind");
