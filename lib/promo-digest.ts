/**
 * The previous-day promo report — the three-section digest that replaces the
 * Grok bot's 8am post.
 */

import { prisma } from "@/lib/prisma";
import { dayDate } from "@/lib/promo-tracker";

export interface DigestLine {
  headline: string;
  advertiser: string;
  url: string;
  daysDetected: number;
  mailers: string[];
}

export interface DigestSection {
  title: string;
  groups: { advertiser: string; lines: DigestLine[] }[];
}

export interface Digest {
  day: string;
  sections: DigestSection[];
  totalPromos: number;
  text: string;
}

export async function buildDigest(day: string): Promise<Digest> {
  const date = dayDate(day);

  const sightings = await prisma.promoSighting.findMany({
    where: { day: date },
    select: {
      publisher: { select: { name: true } },
      list: { select: { name: true } },
      promo: {
        select: {
          id: true,
          headline: true,
          landingUrl: true,
          canonicalKey: true,
          kind: true,
          advertiserLabel: true,
          daysDetected: true,
          firstSeenOn: true,
          advertiser: { select: { label: true, isInternal: true } },
        },
      },
    },
  });

  // Collapse to one line per promo, remembering who mailed it.
  const byPromo = new Map<string, DigestLine & { isInternal: boolean; isNew: boolean; kind: string }>();
  for (const s of sightings) {
    const p = s.promo;
    const mailer = s.list?.name ?? s.publisher?.name ?? "Unknown";
    const line = byPromo.get(p.id);
    if (line) {
      if (!line.mailers.includes(mailer)) line.mailers.push(mailer);
      continue;
    }
    byPromo.set(p.id, {
      headline: p.headline ?? "(no headline)",
      // A per-promo name wins: on a platform domain the advertiser row can only
      // ever name the tooling.
      advertiser: p.advertiserLabel ?? p.advertiser.label,
      url: `https://${p.canonicalKey}`, // tracking params stripped
      daysDetected: p.daysDetected,
      mailers: [mailer],
      isInternal: p.advertiser.isInternal,
      isNew: p.firstSeenOn.getTime() === date.getTime(),
      kind: p.kind,
    });
  }

  const all = [...byPromo.values()];
  const group = (rows: typeof all): DigestSection["groups"] => {
    const map = new Map<string, DigestLine[]>();
    for (const r of rows) {
      if (!map.has(r.advertiser)) map.set(r.advertiser, []);
      map.get(r.advertiser)!.push(r);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([advertiser, lines]) => ({ advertiser, lines }));
  };

  // Startup raises bought on finpub lists (Doroni, Kara Water) aren't competitor
  // offers — they stay on the page behind a filter but out of the report.
  const reportable = all.filter((r) => r.kind !== "EQUITY_RAISE");
  const external = reportable.filter((r) => !r.isInternal);
  const vsl = external.filter((r) => r.kind !== "LEAD_GEN");

  const sections: DigestSection[] = [
    { title: "New External Promos Detected Yesterday", groups: group(vsl.filter((r) => r.isNew)) },
    {
      title: "Previously Detected External Promos (Promoted Yesterday)",
      groups: group(vsl.filter((r) => !r.isNew)),
    },
    { title: "Lead-Gen Offers (Non-VSL)", groups: group(external.filter((r) => r.kind === "LEAD_GEN")) },
    { title: "Oxford Promos Sent Yesterday", groups: group(reportable.filter((r) => r.isInternal)) },
  ];

  return { day, sections, totalPromos: reportable.length, text: renderText(day, sections) };
}

function renderText(day: string, sections: DigestSection[]): string {
  const out: string[] = [`*iSpyFinpub — Promo Report for ${formatDay(day)}*`];

  for (const section of sections) {
    if (!section.groups.length) continue;
    out.push("", `*${section.title}*`);
    for (const g of section.groups) {
      out.push("", g.advertiser);
      for (const line of g.lines) {
        const days = line.daysDetected > 1 ? `   (${line.daysDetected} Days Detected)` : "";
        const via = line.mailers.length ? `  [via ${line.mailers.join(", ")}]` : "";
        out.push(`==> ${line.headline} - ${line.advertiser}${days}${via}`);
        out.push(line.url);
      }
    }
  }

  if (sections.every((s) => !s.groups.length)) out.push("", "_No promos detected._");
  return out.join("\n");
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
