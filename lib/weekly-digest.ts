/**
 * weekly-digest.ts
 *
 * Builds the "This Week in the Industry" summary shown at the top of the
 * dashboard: what topics the tracked financial-newsletter publishers are
 * collectively pushing over the rolling last 7 days, how that shifted vs. the
 * prior week, and a short AI-written synthesis of the rotation.
 *
 * The summary is intentionally topic/theme-first — it does NOT surface
 * individual publishers (that detail lives in the per-topic trend chart).
 *
 * Caching: the whole payload (including the Claude narrative) is memoised in
 * module memory in ~hourly buckets, so a busy dashboard never re-hits Claude
 * on every render. A fresh generation for a new ISO week also fires a
 * best-effort write to the brain vault (append-only, never blocks the page).
 */

import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

export interface DigestTheme {
  id: string;
  name: string;
  count: number;        // # emails tagged with this topic in the last 7d
  distinctPubs: number; // # distinct publishers pushing it
  delta: number | null; // WoW % change (null = new / no prior-week baseline)
}
export interface DigestMover {
  name: string;
  delta: number;
  prev: number;
  count: number;
}
export interface DigestFresh {
  name: string;
  count: number;
}
export interface WeeklyDigest {
  weekStart: string;
  weekEnd: string;
  weekTotal: number;
  prevWeekTotal: number;
  topicCount: number;
  topThemes: DigestTheme[];
  risers: DigestMover[];
  fallers: DigestMover[];
  fresh: DigestFresh[];
  narrative: string | null;
  generatedAt: string;
}

// ─── Pure aggregation ─────────────────────────────────────────────────────────

async function computeDigest(now: Date): Promise<Omit<WeeklyDigest, "narrative">> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const prevWeekStart = new Date(now.getTime() - 14 * DAY);

  const primaryTopic = { isSecondary: false, isIgnored: false } as const;

  const [weekTotal, prevWeekTotal, thisRows, prevRows] = await Promise.all([
    prisma.email.count({ where: { receivedAt: { gte: weekAgo } } }),
    prisma.email.count({ where: { receivedAt: { gte: prevWeekStart, lt: weekAgo } } }),
    prisma.emailTopic.findMany({
      where: { topic: primaryTopic, email: { receivedAt: { gte: weekAgo } } },
      select: {
        topic: { select: { id: true, name: true } },
        email: { select: { publisher: { select: { name: true } } } },
      },
    }),
    prisma.emailTopic.findMany({
      where: { topic: primaryTopic, email: { receivedAt: { gte: prevWeekStart, lt: weekAgo } } },
      select: { topic: { select: { name: true } } },
    }),
  ]);

  // Prior-week counts per topic name (WoW baseline)
  const prevCount = new Map<string, number>();
  for (const r of prevRows) prevCount.set(r.topic.name, (prevCount.get(r.topic.name) ?? 0) + 1);

  // This-week aggregation
  const agg = new Map<string, { id: string; name: string; count: number; pubs: Set<string> }>();
  for (const r of thisRows) {
    const key = r.topic.id;
    if (!agg.has(key)) agg.set(key, { id: r.topic.id, name: r.topic.name, count: 0, pubs: new Set() });
    const t = agg.get(key)!;
    t.count++;
    t.pubs.add(r.email.publisher?.name ?? "Unknown");
  }

  const ranked = [...agg.values()]
    .map(t => {
      const prev = prevCount.get(t.name) ?? 0;
      return {
        id: t.id,
        name: t.name,
        count: t.count,
        distinctPubs: t.pubs.size,
        prev,
        delta: prev === 0 ? null : Math.round(((t.count - prev) / prev) * 100),
      };
    })
    .sort((a, b) => b.count - a.count);

  const topThemes: DigestTheme[] = ranked.slice(0, 8).map(({ id, name, count, distinctPubs, delta }) => ({
    id, name, count, distinctPubs, delta,
  }));

  // Movers: only topics with a meaningful prior-week baseline (>=2) so a
  // 1→3 blip doesn't read as "+200%".
  const withDelta = ranked.filter(t => t.prev >= 2 && t.delta !== null) as (typeof ranked[number] & { delta: number })[];
  const risers: DigestMover[] = [...withDelta].sort((a, b) => b.delta - a.delta).slice(0, 5)
    .filter(t => t.delta > 0)
    .map(({ name, delta, prev, count }) => ({ name, delta, prev, count }));
  const fallers: DigestMover[] = [...withDelta].sort((a, b) => a.delta - b.delta).slice(0, 5)
    .filter(t => t.delta < 0)
    .map(({ name, delta, prev, count }) => ({ name, delta, prev, count }));

  const fresh: DigestFresh[] = ranked
    .filter(t => t.prev === 0 && t.count >= 2)
    .slice(0, 6)
    .map(({ name, count }) => ({ name, count }));

  return {
    weekStart: weekAgo.toISOString().slice(0, 10),
    weekEnd: now.toISOString().slice(0, 10),
    weekTotal,
    prevWeekTotal,
    topicCount: agg.size,
    topThemes,
    risers,
    fallers,
    fresh,
    generatedAt: now.toISOString(),
  };
}

// ─── AI narrative ───────────────────────────────────────────────────────────

async function generateNarrative(d: Omit<WeeklyDigest, "narrative">): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (d.topThemes.length === 0) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const fmt = (m: DigestMover) => `${m.name} (${m.delta > 0 ? "+" : ""}${m.delta}%, ${m.prev}→${m.count})`;
    const prompt = `You are a market-intelligence analyst for a financial newsletter publisher. Below is aggregate data on what topics the tracked competitor/industry newsletters emailed about this week (rolling 7 days), with week-over-week change. Focus on THEMES, not individual publishers.

Emails this week: ${d.weekTotal} (prior week: ${d.prevWeekTotal})

Top themes (topic — mentions — WoW):
${d.topThemes.map(t => `- ${t.name}: ${t.count}${t.delta === null ? " (new)" : ` (${t.delta > 0 ? "+" : ""}${t.delta}%)`}`).join("\n")}

Biggest risers: ${d.risers.map(fmt).join("; ") || "none"}
Biggest fallers: ${d.fallers.map(fmt).join("; ") || "none"}
New this week: ${d.fresh.map(f => `${f.name} (${f.count})`).join("; ") || "none"}

Write a tight 2-3 sentence briefing on what the industry is collectively focused on this week and the most notable rotation vs. last week. Lead with the shift. No preamble, no bullet points, no publisher names, no hype. Analyst voice.`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content.find(c => c.type === "text") as { text: string } | undefined;
    const text = block?.text.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

// ─── Best-effort brain-vault write (once per ISO week) ────────────────────────

function isoWeekKey(d: Date): string {
  // ISO week number, UTC-based (stable regardless of server TZ).
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / DAY) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function writeDigestToBrain(d: WeeklyDigest): Promise<void> {
  const token = process.env.HUB_API_TOKEN;
  if (!token || !d.narrative) return;
  const brainUrl = process.env.BRAIN_API_URL ?? process.env.BRAIN_URL ?? "https://brain.oxfordhub.app";

  const content = [
    `**Industry Weekly Digest — week of ${d.weekStart} → ${d.weekEnd}**`,
    ``,
    d.narrative,
    ``,
    `Top themes: ${d.topThemes.map(t => `${t.name} (${t.count})`).join(", ")}.`,
    d.risers.length ? `Risers: ${d.risers.map(r => `${r.name} +${r.delta}%`).join(", ")}.` : "",
    d.fallers.length ? `Fallers: ${d.fallers.map(f => `${f.name} ${f.delta}%`).join(", ")}.` : "",
    d.fresh.length ? `New this week: ${d.fresh.map(f => f.name).join(", ")}.` : "",
  ].filter(Boolean).join("\n");

  try {
    await fetch(`${brainUrl}/api/intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": token },
      body: JSON.stringify({
        blocks: [{
          entityType: "general",
          entityName: "Industry Weekly Digest",
          items: [{ content, source: "AI_EMAIL", date: new Date(d.generatedAt).toLocaleDateString() }],
        }],
      }),
    });
  } catch {
    /* append-only, best-effort — never affects the page */
  }
}

// ─── Cached public accessor ───────────────────────────────────────────────────

let cache: { bucket: string; payload: WeeklyDigest } | null = null;
let inflight: Promise<WeeklyDigest> | null = null;
let lastBrainWeek: string | null = null;

export async function getWeeklyDigest(): Promise<WeeklyDigest> {
  const now = new Date();
  const bucket = now.toISOString().slice(0, 13); // hourly bucket (YYYY-MM-DDTHH)
  if (cache && cache.bucket === bucket) return cache.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    const base = await computeDigest(now);
    const narrative = await generateNarrative(base);
    const payload: WeeklyDigest = { ...base, narrative };
    cache = { bucket, payload };

    // Once per ISO week, on a fresh generation, teach the brain.
    const wk = isoWeekKey(now);
    if (narrative && wk !== lastBrainWeek) {
      lastBrainWeek = wk;
      void writeDigestToBrain(payload);
    }
    return payload;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
