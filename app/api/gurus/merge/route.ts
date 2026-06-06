import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // Move list associations
  const targetLists = await prisma.guruList.findMany({ where: { guruId: targetId }, select: { listId: true } });
  const targetListIds = new Set(targetLists.map(l => l.listId));
  const sourceLists = await prisma.guruList.findMany({ where: { guruId: sourceId } });
  for (const sl of sourceLists) {
    if (!targetListIds.has(sl.listId)) {
      await prisma.guruList.create({ data: { guruId: targetId, listId: sl.listId, isPrimary: sl.isPrimary } });
    }
  }
  await prisma.guruList.deleteMany({ where: { guruId: sourceId } });
  await prisma.guru.delete({ where: { id: sourceId } });

  return NextResponse.json({ ok: true });
}
