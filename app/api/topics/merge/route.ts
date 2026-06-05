import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/topics/merge
// { sourceId, targetId } — moves all emails from source → target, adds source name as synonym, deletes source
export async function POST(req: NextRequest) {
  const { sourceId, targetId } = await req.json();
  if (!sourceId || !targetId || sourceId === targetId)
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const [source, target] = await Promise.all([
    prisma.topic.findUnique({ where: { id: sourceId } }),
    prisma.topic.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target)
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });

  // Find emails that have BOTH topics — skip those (already have target)
  const bothTopics = await prisma.emailTopic.findMany({
    where: { topicId: targetId, email: { topics: { some: { topicId: sourceId } } } },
    select: { emailId: true },
  });
  const skipIds = new Set(bothTopics.map((r) => r.emailId));

  // Move emails that only have source → give them target
  await prisma.emailTopic.updateMany({
    where: { topicId: sourceId, emailId: { notIn: [...skipIds] } },
    data: { topicId: targetId },
  });

  // Delete any remaining source EmailTopic records (the duplicates we skipped)
  await prisma.emailTopic.deleteMany({ where: { topicId: sourceId } });

  // Add source name + its existing synonyms as synonyms on the target
  const newSynonyms = [source.name, ...source.synonyms].filter(
    (s) => !target.synonyms.includes(s) && s !== target.name
  );
  await prisma.topic.update({
    where: { id: targetId },
    data: { synonyms: { push: newSynonyms } },
  });

  // Delete source
  await prisma.topic.delete({ where: { id: sourceId } });

  return NextResponse.json({ ok: true, merged: source.name, into: target.name, synonymsAdded: newSynonyms });
}
