import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { sourceId, targetId } = await req.json();
  if (!sourceId || !targetId || sourceId === targetId)
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  // Move emails
  await prisma.email.updateMany({ where: { listId: sourceId }, data: { listId: targetId } });

  // Move gurus (skip duplicates)
  const targetGurus = await prisma.guruList.findMany({ where: { listId: targetId }, select: { guruId: true } });
  const targetGuruIds = new Set(targetGurus.map(g => g.guruId));
  const sourceGurus = await prisma.guruList.findMany({ where: { listId: sourceId } });
  for (const sg of sourceGurus) {
    if (!targetGuruIds.has(sg.guruId)) {
      await prisma.guruList.create({ data: { guruId: sg.guruId, listId: targetId, isPrimary: sg.isPrimary } });
    }
  }
  await prisma.guruList.deleteMany({ where: { listId: sourceId } });
  await prisma.list.delete({ where: { id: sourceId } });

  return NextResponse.json({ ok: true });
}
