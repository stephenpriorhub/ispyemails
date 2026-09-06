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
  /** Plain-text rendering, for the in-app preview and the stored run record. */
  text: string;
  /** Slack Block Kit rendering — headers and dividers, as the bot posts today. */
  blocks: SlackBlock[];
}

export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji: true } }
  | { type: "divider" }
  | { type: "section"; text: { type: "mrkdwn"; text: string } };

const INTRO = "Here are the promos that are being pushed around the industry";

/** Empty sections still appear, so the report reads the same shape every day. */
const EMPTY_NOTE: Record<string, string> = {
  "New External Promos Detected Yesterday": "_No new external promos detected yesterday._",
  "Previously Detected External Promos (Promoted Yesterday)":
    "_No previously detected external promos were promoted yesterday._",
  "Lead-Gen Offers (Non-VSL)": "_No lead-gen offers detected yesterday._",
  "Oxford Promos Sent Yesterday": "_No Oxford promos sent yesterday._",
};

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

  return {
    day,
    sections,
    totalPromos: reportable.length,
    text: renderText(day, sections),
    blocks: renderBlocks(sections),
  };
}

function renderText(day: string, sections: DigestSection[]): string {
  const out: string[] = [INTRO, `(${formatDay(day)})`];

  for (const section of sections) {
    out.push("", `── ${section.title} ──`);
    if (!section.groups.length) {
      out.push(EMPTY_NOTE[section.title] ?? "Nothing detected yesterday.");
      continue;
    }
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
  return out.join("\n");
}

/** Slack mrkdwn escaping — only the three characters Slack treats specially. */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderLine(line: DigestLine): string {
  const days = line.daysDetected > 1 ? `   (${line.daysDetected} Days Detected)` : "";
  const via = line.mailers.length ? `  _via ${esc(line.mailers.join(", "))}_` : "";
  return `==> ${esc(line.headline)} - ${esc(line.advertiser)}${days}${via}\n${line.url}`;
}

function renderBlocks(sections: DigestSection[]): SlackBlock[] {
  const blocks: SlackBlock[] = [{ type: "section", text: { type: "mrkdwn", text: INTRO } }];

  for (const section of sections) {
    blocks.push({ type: "header", text: { type: "plain_text", text: section.title.slice(0, 150), emoji: true } });
    blocks.push({ type: "divider" });

    if (!section.groups.length) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: EMPTY_NOTE[section.title] ?? "_Nothing detected yesterday._" },
      });
      continue;
    }

    for (const g of section.groups) {
      // One block per advertiser keeps the block count well inside Slack's
      // limit, and keeps a publisher's promos visually together.
      const body = `*${esc(g.advertiser)}*\n\n${g.lines.map(renderLine).join("\n\n")}`;
      for (const chunk of splitForSlack(body)) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: chunk } });
      }
    }
  }
  return blocks;
}

/** A section block caps at 3000 characters. */
function splitForSlack(text: string, limit = 2900): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if (current && current.length + para.length + 2 > limit) {
      out.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) out.push(current);
  return out;
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
