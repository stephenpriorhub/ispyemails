import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logUserLearning } from "@/lib/learnings";

export async function POST(req: NextRequest) {
  const { sourceId, targetId } = await req.json();
  if (!sourceId || !targetId || sourceId === targetId)
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const [source, target] = await Promise.all([
    prisma.list.findUnique({ where: { id: sourceId } }),
    prisma.list.findUnique({ where: { id: targetId } }),
  ]);

  if (!source || !target) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

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

  // Build merged synonyms: add source.name + source.synonyms to target.synonyms (deduplicated, case-insensitive)
  const existingSynonymsLower = new Set(target.synonyms.map(s => s.toLowerCase()));
  const newSynonyms = [...target.synonyms];
  const candidates = [source.name, ...source.synonyms];
  for (const candidate of candidates) {
    if (!existingSynonymsLower.has(candidate.toLowerCase()) && candidate.toLowerCase() !== target.name.toLowerCase()) {
      newSynonyms.push(candidate);
      existingSynonymsLower.add(candidate.toLowerCase());
    }
  }

  // Update target with merged synonyms and mark all moved emails as listConfirmed
  await prisma.list.update({ where: { id: targetId }, data: { synonyms: newSynonyms } });
  await prisma.email.updateMany({ where: { listId: targetId }, data: { listConfirmed: true } });

  await prisma.list.delete({ where: { id: sourceId } });

  // Log this as user intelligence so the AI learns the merge
  await logUserLearning({
    content: `List '${source.name}' is the same newsletter list as '${target.name}' and should be merged into it`,
    category: "LIST",
    listId: targetId,
  });

  return NextResponse.json({ ok: true, merged: source.name, into: target.name });
}
