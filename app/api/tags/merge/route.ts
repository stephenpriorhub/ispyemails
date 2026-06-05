import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/tags/merge
// { sourceId, targetId } — moves all email assignments, deletes source
export async function POST(req: NextRequest) {
  const { sourceId, targetId } = await req.json();
  if (!sourceId || !targetId || sourceId === targetId)
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const [source, target] = await Promise.all([
    prisma.tag.findUnique({ where: { id: sourceId } }),
    prisma.tag.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target)
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  // Find emails that already have the target tag
  const alreadyHaveTarget = await prisma.emailTag.findMany({
    where: { tagId: targetId },
    select: { emailId: true },
  });
  const skipIds = new Set(alreadyHaveTarget.map((r) => r.emailId));

  // Move emails that only have source
  await prisma.emailTag.updateMany({
    where: { tagId: sourceId, emailId: { notIn: [...skipIds] } },
    data: { tagId: targetId },
  });

  // Delete remaining duplicates
  await prisma.emailTag.deleteMany({ where: { tagId: sourceId } });

  // Delete source tag
  await prisma.tag.delete({ where: { id: sourceId } });

  return NextResponse.json({ ok: true, merged: source.name, into: target.name });
}
