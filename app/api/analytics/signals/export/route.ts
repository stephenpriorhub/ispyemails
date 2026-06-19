/**
 * GET /api/analytics/signals/export
 *
 * Read-only industry-signal aggregation for the brain → Promo Analyzer loop.
 * Returns two compact markdown documents:
 *   1. affiliateFrequency — what affiliate marketers (e.g. MarketBeat) are mailing
 *      and how often, grouped by promoted guru/product + topic over 7/30/90-day
 *      windows. Repeated lifts of the same offer = real-world traction.
 *   2. topicFrequency — cross-publisher topic frequency (how many promos + distinct
 *      publishers are pushing each topic) over the same windows.
 *
 * Protected by CRON_SECRET (server-to-server; Brain Master calls it hourly).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;

function inWindow(d: Date, now: number, days: number): boolean {
  return now - d.getTime() <= days * DAY;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  // Fail closed — this exposes aggregated competitive intel, so require the secret to be configured.
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  const auth = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (auth !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const since90 = new Date(now - 90 * DAY);
  const today = fmtDate(new Date());

  // ── 1. Affiliate send-frequency (MarketBeat etc.) ──
  const affiliates = await prisma.publisher.findMany({
    where: { type: "AFFILIATE_MARKETER" },
    select: { id: true, name: true },
  });

  const affiliateSections: string[] = [];
  for (const aff of affiliates) {
    const emails = await prisma.email.findMany({
      where: { publisherId: aff.id, receivedAt: { gte: since90 } },
      select: {
        receivedAt: true,
        gurus: { select: { guru: { select: { name: true } } } },
        topics: { select: { topic: { select: { name: true } } } },
        offer: { select: { ticker: true } },
      },
      orderBy: { receivedAt: "desc" },
    });

    // Group by promoted guru (the offer's proxy identity) and by topic
    type Bucket = { d7: number; d30: number; d90: number; last: Date };
    const byGuru = new Map<string, Bucket>();
    const byTopic = new Map<string, Bucket>();
    const bump = (m: Map<string, Bucket>, key: string, d: Date) => {
      const b = m.get(key) ?? { d7: 0, d30: 0, d90: 0, last: d };
      if (inWindow(d, now, 7)) b.d7++;
      if (inWindow(d, now, 30)) b.d30++;
      if (inWindow(d, now, 90)) b.d90++;
      if (d > b.last) b.last = d;
      m.set(key, b);
    };
    for (const e of emails) {
      for (const g of e.gurus) bump(byGuru, g.guru.name, e.receivedAt);
      for (const t of e.topics) bump(byTopic, t.topic.name, e.receivedAt);
    }

    const guruRows = [...byGuru.entries()]
      .sort((a, b) => b[1].d30 - a[1].d30)
      .map(([name, b]) => `| ${name} | ${b.d7} | ${b.d30} | ${b.d90} | ${fmtDate(b.last)} |`);
    const topicRows = [...byTopic.entries()]
      .sort((a, b) => b[1].d30 - a[1].d30)
      .map(([name, b]) => `| ${name} | ${b.d7} | ${b.d30} | ${b.d90} | ${fmtDate(b.last)} |`);

    affiliateSections.push(
      `### ${aff.name} (${emails.length} sends in last 90d)\n\n` +
        `**By promoted guru/product** — repeated lifts of the same name across weeks indicate the offer is gaining traction.\n\n` +
        `| Promoted guru/product | 7d | 30d | 90d | Last send |\n|---|---|---|---|---|\n${guruRows.join("\n") || "| _none_ |  |  |  |  |"}\n\n` +
        `**By topic**\n\n| Topic | 7d | 30d | 90d | Last send |\n|---|---|---|---|---|\n${topicRows.join("\n") || "| _none_ |  |  |  |  |"}`
    );
  }

  const affiliateFrequency =
    `---\ntags: [market-intelligence, affiliate-signals, send-frequency]\nsource: iSpyFinpub /api/analytics/signals/export\nupdated: ${today}\n---\n\n` +
    `# Affiliate Send-Frequency (Industry Traction Signal)\n\n` +
    `How often paid affiliate marketers are mailing each offer/topic. Repeated lifts of the same promoted guru/product over multiple weeks = real-world traction ("what's working"). Use as a SECONDARY signal in promo scoring; weigh by recency vs. the promo's run date.\n\n` +
    (affiliateSections.join("\n\n---\n\n") || "_No affiliate marketers tracked yet._");

  // ── 2. Cross-publisher topic frequency ──
  const recentEmails = await prisma.email.findMany({
    where: { receivedAt: { gte: since90 } },
    select: {
      receivedAt: true,
      publisherId: true,
      topics: { select: { topic: { select: { name: true } } } },
    },
  });

  type TopicAgg = { d7: number; d30: number; d90: number; pubs: Set<string> };
  const topicAgg = new Map<string, TopicAgg>();
  for (const e of recentEmails) {
    for (const t of e.topics) {
      const key = t.topic.name;
      const a = topicAgg.get(key) ?? { d7: 0, d30: 0, d90: 0, pubs: new Set<string>() };
      if (inWindow(e.receivedAt, now, 7)) a.d7++;
      if (inWindow(e.receivedAt, now, 30)) a.d30++;
      if (inWindow(e.receivedAt, now, 90)) a.d90++;
      if (e.publisherId) a.pubs.add(e.publisherId);
      topicAgg.set(key, a);
    }
  }
  const topicRows = [...topicAgg.entries()]
    .sort((a, b) => b[1].d30 - a[1].d30)
    .map(([name, a]) => `| ${name} | ${a.d7} | ${a.d30} | ${a.d90} | ${a.pubs.size} |`);

  const topicFrequency =
    `---\ntags: [market-intelligence, topic-frequency, trend-analysis]\nsource: iSpyFinpub /api/analytics/signals/export\nupdated: ${today}\n---\n\n` +
    `# Cross-Publisher Topic Frequency (Market Saturation/Interest Signal)\n\n` +
    `How many promos and distinct publishers are pushing each topic. Many publishers on a topic raises a promo's odds IF copy is strong (rising interest); it can also mean saturation. Use as a SECONDARY signal only.\n\n` +
    `| Topic | Promos 7d | Promos 30d | Promos 90d | Distinct publishers 90d |\n|---|---|---|---|---|\n${topicRows.join("\n") || "| _none_ |  |  |  |  |"}`;

  return NextResponse.json({ ok: true, updated: today, affiliateFrequency, topicFrequency });
}
