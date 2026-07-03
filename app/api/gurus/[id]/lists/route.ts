import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: assign a list to a guru
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: guruId } = await params;
  const { listId, isPrimary } = await req.json();

  // Enforce the publisher rule: a guru may only be a member of lists owned by his
  // primary publisher OR any of his (manually set) secondary publishers. A link to
  // any other publisher's list would mean he's just a guest / being promoted —
  // that's a mention, not a membership.
  const [guru, list] = await Promise.all([
    prisma.guru.findUnique({
      where: { id: guruId },
      select: { publisherId: true, publisher: { select: { name: true } }, secondaryPublishers: { select: { publisherId: true } } },
    }),
    prisma.list.findUnique({ where: { id: listId }, select: { publisherId: true, publisher: { select: { name: true } } } }),
  ]);
  const allowedPublisherIds = [guru?.publisherId, ...(guru?.secondaryPublishers.map(sp => sp.publisherId) ?? [])].filter((x): x is string => !!x);
  if (allowedPublisherIds.length && list?.publisherId && !allowedPublisherIds.includes(list.publisherId)) {
    return NextResponse.json(
      {
        error: `This guru is assigned to ${guru?.publisher?.name ?? "another publisher"} and can only be a member of that publication's lists (or a publisher he's manually tagged as a secondary of). This list belongs to ${list.publisher?.name ?? "a different publisher"} — if the guru only appears there as a guest or promotion, that's a mention, not a membership. To make this a real membership, add that publisher as a secondary publisher on the guru first.`,
      },
      { status: 409 },
    );
  }

  const existing = await prisma.guruList.findUnique({ where: { guruId_listId: { guruId, listId } } });
  if (existing) {
    // Restore if was ignored
    await prisma.guruList.update({ where: { guruId_listId: { guruId, listId } }, data: { isIgnored: false, isPrimary: isPrimary ?? existing.isPrimary } });
  } else {
    await prisma.guruList.create({ data: { guruId, listId, isPrimary: isPrimary ?? false, isIgnored: false } });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: ignore a guru-list association (trains AI not to link them)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: guruId } = await params;
  const { listId } = await req.json();

  // Mark as ignored rather than delete — so AI learns not to re-add it
  await prisma.guruList.upsert({
    where: { guruId_listId: { guruId, listId } },
    update: { isIgnored: true },
    create: { guruId, listId, isIgnored: true },
  });
  return NextResponse.json({ ok: true });
}
