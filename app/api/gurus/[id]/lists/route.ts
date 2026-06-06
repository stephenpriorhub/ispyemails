import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: assign a list to a guru
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: guruId } = await params;
  const { listId, isPrimary } = await req.json();

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
