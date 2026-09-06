/**
 * Nightly promo scan.
 *
 * For one ET calendar day: take every promo/lift-note email, resolve its
 * tracking links to the real landing page, and record which promo each mailer
 * put in front of the industry. Idempotent — re-running a day adds nothing new.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveEmailDestinations,
  advertiserLabelFromDomain,
  rootDomain,
  type Destination,
} from "@/lib/promo-links";

const ET = "America/New_York";

/** Oxford Group properties — separates "what we mailed" from "what they mailed". */
const DEFAULT_INTERNAL_DOMAINS = [
  "monumenttradersalliance.com",
  "mtatradeoftheday.com",
  "oxfordclub.com",
  "wealthyretirement.com",
  "libertythroughwealth.com",
  "manwardpress.com",
];

export const internalDomains = (): Set<string> =>
  new Set(
    (process.env.INTERNAL_PROMO_DOMAINS?.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) ??
      DEFAULT_INTERNAL_DOMAINS),
  );

// ─── ET calendar-day helpers ─────────────────────────────────────────────────

/** "2026-09-05" for the ET day containing `at`. */
export function etDayString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function etYesterday(at: Date = new Date()): string {
  return etDayString(new Date(at.getTime() - 24 * 60 * 60 * 1000));
}

/** Wall-clock hour and minute in ET, for the scheduler. */
export function etClock(at: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute") };
}

function etOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of ET midnight starting `day` ("2026-09-05"). DST-correct. */
export function etMidnightUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = new Date(naive);
  for (let i = 0; i < 2; i++) guess = new Date(naive - etOffsetMs(guess));
  return guess;
}

/** The @db.Date value for an ET day — the calendar date itself, no timezone. */
export const dayDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

export function etDayBounds(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDay = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return { start: etMidnightUtc(day), end: etMidnightUtc(nextDay) };
}

// ─── Advertiser attribution ──────────────────────────────────────────────────

type PublisherLite = { id: string; name: string; type: string; domains: string[] };

async function advertiserFor(
  dest: Destination,
  publishers: PublisherLite[],
  mailerName: string | null,
): Promise<string> {
  const domain = dest.rootDomain;
  const existing = await prisma.promoAdvertiser.findUnique({
    where: { domain },
    select: { id: true, label: true, labelConfirmed: true },
  });
  if (existing) {
    // A later promo on the same domain may expose a real brand name where the
    // first one only gave us a squashed domain. Take the upgrade — but never
    // over a label a human has set.
    if (!existing.labelConfirmed && dest.siteName && dest.siteName !== existing.label) {
      const derived = advertiserLabelFromDomain(dest.host);
      if (existing.label === derived) {
        await prisma.promoAdvertiser.update({ where: { id: existing.id }, data: { label: dest.siteName } });
      }
    }
    return existing.id;
  }

  // A landing page on a publisher's own domain is that publisher's promo.
  // Match the domain label rather than the whole domain — publishers routinely
  // run promos on an alternate TLD (porterandcompanyresearch.co vs .com).
  const label2 = (d: string) => rootDomain(d).replace(/\.[a-z.]+$/, "");
  const publisher =
    publishers.find((p) => p.domains.some((d) => rootDomain(d) === domain)) ??
    publishers.find((p) => p.domains.some((d) => label2(d) && label2(d) === label2(domain)));

  // Zoom/beehiiv/etc. host other people's funnels — the domain names nobody, so
  // credit the mailer and let it be corrected in the UI.
  const label = publisher?.name
    ?? (dest.isPlatform && mailerName ? `${mailerName} (via ${domain})` : null)
    ?? dest.siteName
    ?? advertiserLabelFromDomain(dest.host);

  const isInternal = publisher?.type === "INTERNAL" || internalDomains().has(domain);

  const created = await prisma.promoAdvertiser
    .create({
      data: { domain, label, publisherId: publisher?.id ?? null, isInternal },
      select: { id: true },
    })
    .catch(async () => {
      // Concurrent scan created it first — Prisma upsert is not atomic.
      const row = await prisma.promoAdvertiser.findUnique({ where: { domain }, select: { id: true } });
      if (!row) throw new Error(`Could not resolve advertiser for ${domain}`);
      return row;
    });
  return created.id;
}

// ─── The scan ────────────────────────────────────────────────────────────────

export interface ScanResult {
  day: string;
  emailsScanned: number;
  sightings: number;
  newPromos: number;
  unresolved: number;
  errors: string[];
}

const CONCURRENCY = 4;

export async function scanDay(day: string, { force = false } = {}): Promise<ScanResult> {
  const { start, end } = etDayBounds(day);
  const date = dayDate(day);

  // A forced re-scan replaces the day rather than adding to it, so tightening
  // the filters actually removes what a looser earlier pass let through.
  if (force) await prisma.promoSighting.deleteMany({ where: { day: date } });

  const emails = await prisma.email.findMany({
    where: {
      receivedAt: { gte: start, lt: end },
      emailType: { in: ["PROMO", "LIFT_NOTE"] },
      bodyHtml: { not: null },
      ...(force ? {} : { promoSightings: { none: {} } }),
    },
    select: {
      id: true,
      subject: true,
      fromEmail: true,
      listId: true,
      publisherId: true,
      bodyHtml: true,
      publisher: { select: { id: true, name: true, type: true, domains: true } },
      list: { select: { category: true } },
    },
    orderBy: { receivedAt: "asc" },
  });

  const publishers = await prisma.publisher.findMany({ select: { id: true, name: true, type: true, domains: true } });

  const result: ScanResult = { day, emailsScanned: emails.length, sightings: 0, newPromos: 0, unresolved: 0, errors: [] };

  const queue = [...emails];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let email = queue.shift(); email; email = queue.shift()) {
      try {
        // A marketing file linking back to its own site is showing you its
        // content, not an advertiser's promo — never treat that as the promo.
        const isAffiliateFile =
          email.publisher?.type === "AFFILIATE_MARKETER" || email.list?.category === "MARKETING_FILE";
        const exclude = isAffiliateFile
          ? [
              ...(email.publisher?.domains ?? []).map(rootDomain),
              rootDomain(email.fromEmail.split("@")[1] ?? ""),
            ].filter(Boolean)
          : [];

        const dests = await resolveEmailDestinations(email.bodyHtml!, { excludeRootDomains: exclude });
        const dest = dests[0];
        if (!dest) {
          result.unresolved++;
          continue;
        }

        const advertiserId = await advertiserFor(dest, publishers, email.publisher?.name ?? null);
        const headline = dest.headline ?? email.subject;
        const headlineSource = dest.headline ? dest.headlineSource : "SUBJECT";

        const existing = await prisma.promo.findUnique({
          where: { canonicalKey: dest.canonicalKey },
          select: { id: true, firstSeenOn: true, lastSeenOn: true, headlineSource: true },
        });

        let promoId: string;
        let isFirstEver = false;

        if (existing) {
          promoId = existing.id;
          // Only upgrade a headline we had to guess from the subject line.
          const upgradeHeadline =
            dest.headline && existing.headlineSource === "SUBJECT" ? { headline, headlineSource } : {};
          await prisma.promo.update({
            where: { id: promoId },
            data: {
              landingUrl: dest.url,
              lastStatus: dest.status,
              lastSeenOn: date > existing.lastSeenOn ? date : existing.lastSeenOn,
              firstSeenOn: date < existing.firstSeenOn ? date : existing.firstSeenOn,
              ...upgradeHeadline,
            },
          });
        } else {
          isFirstEver = true;
          const created = await prisma.promo
            .create({
              data: {
                canonicalKey: dest.canonicalKey,
                landingUrl: dest.url,
                landingHost: dest.host,
                advertiserId,
                headline,
                headlineSource,
                lastStatus: dest.status,
                firstSeenOn: date,
                lastSeenOn: date,
              },
              select: { id: true },
            })
            .catch(async () => {
              isFirstEver = false;
              const row = await prisma.promo.findUnique({
                where: { canonicalKey: dest.canonicalKey },
                select: { id: true },
              });
              if (!row) throw new Error(`Could not resolve promo ${dest.canonicalKey}`);
              return row;
            });
          promoId = created.id;
          if (isFirstEver) result.newPromos++;
        }

        await prisma.promoSighting.upsert({
          where: { promoId_emailId: { promoId, emailId: email.id } },
          update: {},
          create: {
            promoId,
            emailId: email.id,
            day: date,
            publisherId: email.publisherId,
            listId: email.listId,
            subject: email.subject,
            rawUrl: dest.url,
            isFirstEver,
          },
        });
        result.sightings++;

        await refreshDaysDetected(promoId);
      } catch (err) {
        result.errors.push(`${email.id}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  });

  await Promise.all(workers);

  // Promos whose every sighting has been re-scanned away are orphans now.
  if (force) await prisma.promo.deleteMany({ where: { sightings: { none: {} } } });

  return result;
}

/** Recompute the day span from the sightings that actually exist. */
async function refreshDaysDetected(promoId: string): Promise<void> {
  const rows = await prisma.promoSighting.findMany({
    where: { promoId },
    select: { day: true },
    distinct: ["day"],
    orderBy: { day: "asc" },
  });
  if (!rows.length) return;
  await prisma.promo.update({
    where: { id: promoId },
    data: {
      daysDetected: rows.length,
      firstSeenOn: rows[0].day,
      lastSeenOn: rows[rows.length - 1].day,
    },
  });
}
