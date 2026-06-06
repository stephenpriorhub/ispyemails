import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns validated learnings grouped by entity, formatted for brain vault export
export async function GET() {
  const learnings = await prisma.learning.findMany({
    where: { status: "VALIDATED" },
    include: {
      guru: { select: { name: true } },
      publisher: { select: { name: true } },
      list: { select: { name: true } },
      email: { select: { subject: true, receivedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by entity
  const byGuru: Record<string, { name: string; learnings: typeof learnings }> = {};
  const byPublisher: Record<string, { name: string; learnings: typeof learnings }> = {};
  const byList: Record<string, { name: string; learnings: typeof learnings }> = {};
  const general: typeof learnings = [];

  for (const l of learnings) {
    if (l.guruId && l.guru) {
      if (!byGuru[l.guruId]) byGuru[l.guruId] = { name: l.guru.name, learnings: [] };
      byGuru[l.guruId].learnings.push(l);
    } else if (l.publisherId && l.publisher) {
      if (!byPublisher[l.publisherId]) byPublisher[l.publisherId] = { name: l.publisher.name, learnings: [] };
      byPublisher[l.publisherId].learnings.push(l);
    } else if (l.listId && l.list) {
      if (!byList[l.listId]) byList[l.listId] = { name: l.list.name, learnings: [] };
      byList[l.listId].learnings.push(l);
    } else {
      general.push(l);
    }
  }

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Build markdown blocks
  const blocks: { title: string; entity: string; markdown: string }[] = [];

  for (const [, { name, learnings: items }] of Object.entries(byGuru)) {
    const lines = items.map(l => `- ${l.content}${l.email ? ` *(from: ${l.email.subject.substring(0, 50)}, ${new Date(l.email.receivedAt).toLocaleDateString()})* ` : ""}`).join("\n");
    blocks.push({
      title: `Guru: ${name}`,
      entity: name,
      markdown: `## Competitor Intelligence (from iSpyFinpub)\n*Last updated: ${today}*\n\n${lines}`,
    });
  }

  for (const [, { name, learnings: items }] of Object.entries(byPublisher)) {
    const lines = items.map(l => `- ${l.content}`).join("\n");
    blocks.push({
      title: `Publisher: ${name}`,
      entity: name,
      markdown: `## Competitor Intelligence (from iSpyFinpub)\n*Last updated: ${today}*\n\n${lines}`,
    });
  }

  for (const [, { name, learnings: items }] of Object.entries(byList)) {
    const lines = items.map(l => `- ${l.content}`).join("\n");
    blocks.push({
      title: `List: ${name}`,
      entity: name,
      markdown: `## Competitor Intelligence (from iSpyFinpub)\n*Last updated: ${today}*\n\n${lines}`,
    });
  }

  if (general.length > 0) {
    const lines = general.map(l => `- ${l.content}`).join("\n");
    blocks.push({
      title: "General",
      entity: "General",
      markdown: `## Competitor Intelligence — General (from iSpyFinpub)\n*Last updated: ${today}*\n\n${lines}`,
    });
  }

  return NextResponse.json({ blocks, total: learnings.length });
}
