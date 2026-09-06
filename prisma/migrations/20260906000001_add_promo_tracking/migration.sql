-- Promo tracking: resolved VSL landing pages, day-by-day sightings, and the
-- scheduled-job ledger behind the midnight scan / 8am digest.

CREATE TABLE "PromoAdvertiser" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "publisherId" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoAdvertiser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoAdvertiser_domain_key" ON "PromoAdvertiser"("domain");

ALTER TABLE "PromoAdvertiser" ADD CONSTRAINT "PromoAdvertiser_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "landingUrl" TEXT NOT NULL,
    "landingHost" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "headline" TEXT,
    "headlineSource" TEXT,
    "lastStatus" INTEGER,
    "firstSeenOn" DATE NOT NULL,
    "lastSeenOn" DATE NOT NULL,
    "daysDetected" INTEGER NOT NULL DEFAULT 1,
    "vidripperJobId" TEXT,
    "vidripperStatus" TEXT,
    "vidripperError" TEXT,
    "promoReviewId" TEXT,
    "ripRequestedAt" TIMESTAMP(3),
    "ripRequestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Promo_canonicalKey_key" ON "Promo"("canonicalKey");
CREATE INDEX "Promo_lastSeenOn_idx" ON "Promo"("lastSeenOn");
CREATE INDEX "Promo_advertiserId_idx" ON "Promo"("advertiserId");

ALTER TABLE "Promo" ADD CONSTRAINT "Promo_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "PromoAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PromoSighting" (
    "id" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "publisherId" TEXT,
    "listId" TEXT,
    "subject" TEXT NOT NULL,
    "rawUrl" TEXT NOT NULL,
    "isFirstEver" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoSighting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoSighting_promoId_emailId_key" ON "PromoSighting"("promoId", "emailId");
CREATE INDEX "PromoSighting_day_idx" ON "PromoSighting"("day");
CREATE INDEX "PromoSighting_publisherId_idx" ON "PromoSighting"("publisherId");
CREATE INDEX "PromoSighting_listId_idx" ON "PromoSighting"("listId");

ALTER TABLE "PromoSighting" ADD CONSTRAINT "PromoSighting_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoSighting" ADD CONSTRAINT "PromoSighting_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoSighting" ADD CONSTRAINT "PromoSighting_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoSighting" ADD CONSTRAINT "PromoSighting_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PromoJobRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "promosFound" INTEGER NOT NULL DEFAULT 0,
    "newPromos" INTEGER NOT NULL DEFAULT 0,
    "digestText" TEXT,
    "slackTs" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "PromoJobRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoJobRun_kind_day_key" ON "PromoJobRun"("kind", "day");
