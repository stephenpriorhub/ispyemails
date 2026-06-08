import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logUserLearning } from "@/lib/learnings";

// POST /api/publishers/merge
// body: { sourceId: string, targetId: string }
// Moves all emails from source → target, merges domains + fromAddresses, deletes source
export async function POST(req: NextRequest) {
  const { sourceId, targetId } = await req.json();

  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ error: "Invalid source or target" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.publisher.findUnique({ where: { id: sourceId } }),
    prisma.publisher.findUnique({ where: { id: targetId } }),
  ]);

  if (!source || !target) {
    return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
  }

  // Merge domains and fromAddresses (deduplicated)
  const mergedDomains = [...new Set([...target.domains, ...source.domains])];
  const mergedFromAddresses = [...new Set([...target.knownFromAddresses, ...source.knownFromAddresses])];

  // Move all emails from source to target
  await prisma.email.updateMany({
    where: { publisherId: sourceId },
    data: { publisherId: targetId, publisherConfirmed: true },
  });

  // Update target with merged data
  await prisma.publisher.update({
    where: { id: targetId },
    data: {
      domains: mergedDomains,
      knownFromAddresses: mergedFromAddresses,
      isConfirmed: true,
    },
  });

  // Delete source
  await prisma.publisher.delete({ where: { id: sourceId } });

  // Log this as user intelligence (not brain-exportable)
  await logUserLearning({
    content: `Publisher "${source.name}" is the same as / merged into "${target.name}"`,
    category: "PUBLISHER",
    publisherId: targetId,
  });

  return NextResponse.json({ ok: true, merged: source.name, into: target.name });
}
