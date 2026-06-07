import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BRAIN_URL = process.env.BRAIN_URL ?? "https://brain.oxfordhub.app";
const HUB_API_TOKEN = process.env.HUB_API_TOKEN ?? "";

function groupLearnings(learnings: Awaited<ReturnType<typeof fetchLearnings>>) {
  const byGuru: Record<string, { name: string; id: string; items: typeof learnings }> = {};
  const byPublisher: Record<string, { name: string; id: string; items: typeof learnings }> = {};
  const byList: Record<string, { name: string; id: string; items: typeof learnings }> = {};
  const general: typeof learnings = [];

  for (const l of learnings) {
    if (l.guruId && l.guru) {
      if (!byGuru[l.guruId]) byGuru[l.guruId] = { name: l.guru.name, id: l.guruId, items: [] };
      byGuru[l.guruId].items.push(l);
    } else if (l.publisherId && l.publisher) {
      if (!byPublisher[l.publisherId]) byPublisher[l.publisherId] = { name: l.publisher.name, id: l.publisherId, items: [] };
      byPublisher[l.publisherId].items.push(l);
    } else if (l.listId && l.list) {
      if (!byList[l.listId]) byList[l.listId] = { name: l.list.name, id: l.listId, items: [] };
      byList[l.listId].items.push(l);
    } else {
      general.push(l);
    }
  }
  return { byGuru, byPublisher, byList, general };
}

async function fetchLearnings(appendedOnly?: boolean) {
  return prisma.learning.findMany({
    where: {
      status: "VALIDATED",
      ...(appendedOnly === false ? { appendedToBrain: false } : {}),
    },
    include: {
      guru: { select: { name: true } },
      publisher: { select: { name: true } },
      list: { select: { name: true } },
      email: { select: { subject: true, receivedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// GET — returns grouped learnings for display in Export tab
export async function GET() {
  const learnings = await fetchLearnings();
  const { byGuru, byPublisher, byList, general } = groupLearnings(learnings);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const blocks: { title: string; entity: string; entityType: string; learningIds: string[]; markdown: string; appended: boolean }[] = [];

  for (const [, { name, items }] of Object.entries(byGuru)) {
    const lines = items.map(l => `- ${l.content}${l.email ? ` *(${new Date(l.email.receivedAt).toLocaleDateString()})* ` : ""}`).join("\n");
    blocks.push({
      title: `Guru: ${name}`, entity: name, entityType: "guru",
      learningIds: items.map(l => l.id),
      appended: items.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${lines}`,
    });
  }
  for (const [, { name, items }] of Object.entries(byPublisher)) {
    blocks.push({
      title: `Publisher: ${name}`, entity: name, entityType: "publisher",
      learningIds: items.map(l => l.id),
      appended: items.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${items.map(l => `- ${l.content}`).join("\n")}`,
    });
  }
  for (const [, { name, items }] of Object.entries(byList)) {
    blocks.push({
      title: `List: ${name}`, entity: name, entityType: "list",
      learningIds: items.map(l => l.id),
      appended: items.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${items.map(l => `- ${l.content}`).join("\n")}`,
    });
  }
  if (general.length > 0) {
    blocks.push({
      title: "General", entity: "General", entityType: "general",
      learningIds: general.map(l => l.id),
      appended: general.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${general.map(l => `- ${l.content}`).join("\n")}`,
    });
  }

  return NextResponse.json({ blocks, total: learnings.length });
}

// POST — push ALL validated learnings to brain vault
export async function POST() {
  if (!HUB_API_TOKEN) return NextResponse.json({ error: "HUB_API_TOKEN not configured" }, { status: 500 });

  const learnings = await fetchLearnings();
  const { byGuru, byPublisher, byList, general } = groupLearnings(learnings);

  // Build blocks for brain-map API
  const blocks = [
    ...Object.values(byGuru).map(({ name, items }) => ({
      entityType: "guru" as const,
      entityName: name,
      items: items.map(l => ({
        content: l.content,
        source: l.source,
        date: new Date(l.createdAt).toLocaleDateString(),
      })),
    })),
    ...Object.values(byPublisher).map(({ name, items }) => ({
      entityType: "publisher" as const,
      entityName: name,
      items: items.map(l => ({ content: l.content, source: l.source, date: new Date(l.createdAt).toLocaleDateString() })),
    })),
    ...Object.values(byList).map(({ name, items }) => ({
      entityType: "list" as const,
      entityName: name,
      items: items.map(l => ({ content: l.content, source: l.source, date: new Date(l.createdAt).toLocaleDateString() })),
    })),
    ...(general.length > 0 ? [{
      entityType: "general" as const,
      entityName: "General",
      items: general.map(l => ({ content: l.content, source: l.source, date: new Date(l.createdAt).toLocaleDateString() })),
    }] : []),
  ];

  if (!blocks.length) return NextResponse.json({ ok: true, message: "Nothing to push", written: [] });

  // Call brain-map
  const brainRes = await fetch(`${BRAIN_URL}/api/intelligence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-token": HUB_API_TOKEN },
    body: JSON.stringify({ blocks }),
  });

  if (!brainRes.ok) {
    const err = await brainRes.text();
    return NextResponse.json({ error: `Brain vault error: ${err}` }, { status: 502 });
  }

  const brainData = await brainRes.json();

  // Mark all as appended
  const allIds = learnings.map(l => l.id);
  await prisma.learning.updateMany({
    where: { id: { in: allIds } },
    data: { appendedToBrain: true, appendedAt: new Date() },
  });

  return NextResponse.json({ ok: true, ...brainData, marked: allIds.length });
}
