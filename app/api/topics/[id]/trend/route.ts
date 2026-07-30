import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Daily trend for a single topic over a window, with per-day publisher breakdown.
 * Powers the "Trending Investment Topics" chart popup:
 *   GET /api/topics/:id/trend?days=30
 * Returns continuous daily buckets (including zero days) and, per day, the top 5
 * publishers by share so the chart tooltip can show who drove that day.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "30");
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  const topic = await prisma.topic.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!topic) return NextResponse.json({ error: "topic not found" }, { status: 404 });

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  // Use the SAME rolling window as the trend list + the /emails?days= filter
  // (now − N×24h) so the bucket totals reconcile exactly with the count shown
  // on the topic row and in the filtered email view.
  const rollingStart = new Date(now.getTime() - days * DAY);

  const rows = await prisma.emailTopic.findMany({
    where: { topicId: id, email: { receivedAt: { gte: rollingStart } } },
    select: { email: { select: { receivedAt: true, publisher: { select: { name: true } } } } },
  });

  // Pre-seed one bucket per calendar day (UTC) from the window's first day
  // through today so the chart has a continuous x-axis. The earliest day may be
  // partial (it starts mid-day), which is correct for a rolling window.
  const firstDayMs = Date.UTC(rollingStart.getUTCFullYear(), rollingStart.getUTCMonth(), rollingStart.getUTCDate());
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const numBuckets = Math.round((todayMs - firstDayMs) / DAY) + 1;
  const buckets = new Map<string, { total: number; pubs: Map<string, number> }>();
  for (let i = 0; i < numBuckets; i++) {
    const key = new Date(firstDayMs + i * DAY).toISOString().slice(0, 10);
    buckets.set(key, { total: 0, pubs: new Map() });
  }

  for (const r of rows) {
    const key = new Date(r.email.receivedAt).toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue; // guard against edge rows outside the seeded range
    b.total++;
    const pub = r.email.publisher?.name ?? "Unknown";
    b.pubs.set(pub, (b.pubs.get(pub) ?? 0) + 1);
  }

  const out = [...buckets.entries()].map(([date, b]) => ({
    date,
    total: b.total,
    pubs: [...b.pubs.entries()]
      .sort((a, c) => c[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count, pct: b.total ? Math.round((count / b.total) * 100) : 0 })),
  }));

  return NextResponse.json({
    topic,
    days,
    total: rows.length,
    todayKey,
    buckets: out,
  });
}
