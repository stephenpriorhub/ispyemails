import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const publisher = await prisma.publisher.findUnique({
    where: { id },
    include: {
      emails: {
        orderBy: { receivedAt: "desc" },
        take: 50,
        include: { topics: { include: { topic: true } }, offer: true },
      },
      _count: { select: { emails: true } },
    },
  });
  if (!publisher) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [last7d, last30d, topTopics, typeSplit, placementSplit] = await Promise.all([
    prisma.email.count({ where: { publisherId: id, receivedAt: { gte: d7 } } }),
    prisma.email.count({ where: { publisherId: id, receivedAt: { gte: d30 } } }),
    prisma.emailTopic.groupBy({ by: ["topicId"], _count: true, where: { email: { publisherId: id } }, orderBy: { _count: { topicId: "desc" } }, take: 10 }),
    prisma.email.groupBy({ by: ["emailType"], _count: true, where: { publisherId: id } }),
    prisma.email.groupBy({ by: ["inboxPlacement"], _count: true, where: { publisherId: id } }),
  ]);

  const topicDetails = await prisma.topic.findMany({ where: { id: { in: topTopics.map((t) => t.topicId) } } });

  return NextResponse.json({
    ...publisher,
    stats: { last7d, last30d, total: publisher._count.emails },
    topTopics: topTopics.map((t) => ({ ...t, topic: topicDetails.find((td) => td.id === t.topicId) })),
    typeSplit,
    placementSplit,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const publisher = await prisma.publisher.update({
    where: { id },
    data: {
      name: body.name,
      domains: body.domains,
      website: body.website,
      notes: body.notes,
      isConfirmed: true,
    },
  });
  return NextResponse.json(publisher);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { unassignEmails } = await req.json().catch(() => ({ unassignEmails: true }));

  if (unassignEmails) {
    // Unassign all emails from this publisher (don't delete the emails)
    await prisma.email.updateMany({
      where: { publisherId: id },
      data: { publisherId: null, publisherConfirmed: false },
    });
  }

  await prisma.publisher.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
