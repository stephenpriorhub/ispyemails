import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const DAYS_PER_PAGE = 4;

/**
 * The promo feed, one ET calendar day at a time.
 *
 * Paging is by day rather than by row so the infinite scroll can never split a
 * day across two pages: `cursor` is the last day already rendered.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor"); // YYYY-MM-DD — return days strictly before this
  const publisherId = sp.get("publisher");
  const listId = sp.get("list");
  const advertiserId = sp.get("advertiser");
  const scope = sp.get("scope"); // external | internal | all
  const q = sp.get("q");

  const where: Prisma.PromoSightingWhereInput = {};
  if (cursor && /^\d{4}-\d{2}-\d{2}$/.test(cursor)) where.day = { lt: new Date(`${cursor}T00:00:00.000Z`) };
  if (publisherId) where.publisherId = publisherId;
  if (listId) where.listId = listId;
  const promoFilter: Prisma.PromoWhereInput = {};
  if (advertiserId) promoFilter.advertiserId = advertiserId;
  if (scope === "external" || scope === "internal") {
    promoFilter.advertiser = { isInternal: scope === "internal" };
  }
  if (Object.keys(promoFilter).length) where.promo = promoFilter;
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { promo: { headline: { contains: q, mode: "insensitive" } } },
      { promo: { landingUrl: { contains: q, mode: "insensitive" } } },
      { promo: { advertiser: { label: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const dayRows = await prisma.promoSighting.findMany({
    where,
    select: { day: true },
    distinct: ["day"],
    orderBy: { day: "desc" },
    take: DAYS_PER_PAGE,
  });
  const days = dayRows.map((r) => r.day);

  if (!days.length) return NextResponse.json({ days: [], nextCursor: null });

  const sightings = await prisma.promoSighting.findMany({
    where: { ...where, day: { in: days } },
    include: {
      publisher: { select: { id: true, name: true, type: true } },
      list: { select: { id: true, name: true, category: true } },
      promo: {
        include: { advertiser: { select: { id: true, label: true, domain: true, isInternal: true } } },
      },
    },
    orderBy: [{ day: "desc" }, { createdAt: "asc" }],
  });

  // One card per promo per day, listing every list that mailed it that day.
  const byDay = new Map<string, Map<string, PromoCard>>();
  for (const s of sightings) {
    const day = s.day.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Map());
    const cards = byDay.get(day)!;
    const card = cards.get(s.promoId);
    const mailer = {
      publisherId: s.publisher?.id ?? null,
      publisher: s.publisher?.name ?? "Unknown",
      listId: s.list?.id ?? null,
      list: s.list?.name ?? null,
      subject: s.subject,
      emailId: s.emailId,
    };
    if (card) {
      if (!card.mailers.some((m) => m.emailId === mailer.emailId)) card.mailers.push(mailer);
      continue;
    }
    cards.set(s.promoId, {
      id: s.promo.id,
      headline: s.promo.headline,
      headlineSource: s.promo.headlineSource,
      url: s.promo.landingUrl,
      displayUrl: s.promo.canonicalKey,
      host: s.promo.landingHost,
      lastStatus: s.promo.lastStatus,
      advertiser: s.promo.advertiser,
      daysDetected: s.promo.daysDetected,
      firstSeenOn: s.promo.firstSeenOn.toISOString().slice(0, 10),
      isNew: s.isFirstEver,
      vidripperJobId: s.promo.vidripperJobId,
      vidripperStatus: s.promo.vidripperStatus,
      promoReviewId: s.promo.promoReviewId,
      mailers: [mailer],
    });
  }

  const out = [...byDay.entries()].map(([day, cards]) => ({
    day,
    promos: [...cards.values()].sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.advertiser.label.localeCompare(b.advertiser.label)),
  }));

  return NextResponse.json({
    days: out,
    nextCursor: days.length === DAYS_PER_PAGE ? days[days.length - 1].toISOString().slice(0, 10) : null,
  });
}

interface PromoCard {
  id: string;
  headline: string | null;
  headlineSource: string | null;
  url: string;
  displayUrl: string;
  host: string;
  lastStatus: number | null;
  advertiser: { id: string; label: string; domain: string; isInternal: boolean };
  daysDetected: number;
  firstSeenOn: string;
  isNew: boolean;
  vidripperJobId: string | null;
  vidripperStatus: string | null;
  promoReviewId: string | null;
  mailers: {
    publisherId: string | null;
    publisher: string;
    listId: string | null;
    list: string | null;
    subject: string;
    emailId: string;
  }[];
}
