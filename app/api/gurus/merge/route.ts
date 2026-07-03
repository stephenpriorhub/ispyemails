import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logUserLearning } from "@/lib/learnings";

export async function POST(req: NextRequest) {
  const { sourceId, targetId } = await req.json();
  if (!sourceId || !targetId || sourceId === targetId)
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  // Move email-guru associations
  const targetEmails = await prisma.emailGuru.findMany({ where: { guruId: targetId }, select: { emailId: true } });
  const targetEmailIds = new Set(targetEmails.map(e => e.emailId));
  const sourceEmails = await prisma.emailGuru.findMany({ where: { guruId: sourceId } });
  for (const se of sourceEmails) {
    if (!targetEmailIds.has(se.emailId)) {
      await prisma.emailGuru.create({ data: { emailId: se.emailId, guruId: targetId } });
    }
  }
  await prisma.emailGuru.deleteMany({ where: { guruId: sourceId } });

  // Carry over the source's secondary publishers (union) — merging combines the
  // two identities, so the target inherits any publishers the source wrote for.
  const sourceSecondaries = await prisma.guruSecondaryPublisher.findMany({ where: { guruId: sourceId }, select: { publisherId: true } });
  const targetGuru = await prisma.guru.findUnique({
    where: { id: targetId },
    select: { publisherId: true, secondaryPublishers: { select: { publisherId: true } } },
  });
  for (const sp of sourceSecondaries) {
    // Don't duplicate the target's primary as a secondary.
    if (sp.publisherId === targetGuru?.publisherId) continue;
    await prisma.guruSecondaryPublisher.upsert({
      where: { guruId_publisherId: { guruId: targetId, publisherId: sp.publisherId } },
      update: {},
      create: { guruId: targetId, publisherId: sp.publisherId },
    });
  }
  await prisma.guruSecondaryPublisher.deleteMany({ where: { guruId: sourceId } });

  // Move list associations — but respect the publisher rule: only carry over
  // memberships in lists owned by the target's primary or (now-merged) secondary
  // publishers. A source membership in any other publisher's list was a promotion,
  // not a membership, so it must not survive the merge.
  const allowedPublisherIds = new Set(
    [targetGuru?.publisherId, ...(targetGuru?.secondaryPublishers.map(sp => sp.publisherId) ?? []), ...sourceSecondaries.map(sp => sp.publisherId)]
      .filter((x): x is string => !!x),
  );
  const targetLists = await prisma.guruList.findMany({ where: { guruId: targetId }, select: { listId: true } });
  const targetListIds = new Set(targetLists.map(l => l.listId));
  const sourceLists = await prisma.guruList.findMany({
    where: { guruId: sourceId },
    include: { list: { select: { publisherId: true } } },
  });
  for (const sl of sourceLists) {
    if (targetListIds.has(sl.listId)) continue;
    // Skip cross-publisher lists when the target guru is assigned to a publisher.
    if (allowedPublisherIds.size && sl.list.publisherId && !allowedPublisherIds.has(sl.list.publisherId)) continue;
    await prisma.guruList.create({ data: { guruId: targetId, listId: sl.listId, isPrimary: sl.isPrimary } });
  }
  await prisma.guruList.deleteMany({ where: { guruId: sourceId } });

  const [source, target] = await Promise.all([
    prisma.guru.findUnique({ where: { id: sourceId }, select: { name: true } }),
    prisma.guru.findUnique({ where: { id: targetId }, select: { name: true } }),
  ]);

  await prisma.guru.delete({ where: { id: sourceId } });

  if (source && target) {
    await logUserLearning({
      content: `"${source.name}" is the same person as / merged into "${target.name}"`,
      category: "GURU",
      guruId: targetId,
    });
  }

  return NextResponse.json({ ok: true });
}
