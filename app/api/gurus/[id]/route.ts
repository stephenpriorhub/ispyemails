import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logUserLearning } from "@/lib/learnings";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guru = await prisma.guru.findUnique({
    where: { id },
    include: {
      publisher: true,
      lists: { include: { list: { include: { publisher: true } } } },
      primaryGurus: { include: { primaryGuru: true } },
      secondaryVoices: { include: { secondaryVoice: true } },
      _count: { select: { emails: true } },
    },
  });
  if (!guru) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(guru);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, notes, isIgnored, isSecondaryVoice, publisherId } = await req.json();
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (notes !== undefined) data.notes = notes;
  if (isIgnored !== undefined) data.isIgnored = isIgnored;
  if (isSecondaryVoice !== undefined) data.isSecondaryVoice = isSecondaryVoice;
  if (publisherId !== undefined) data.publisherId = publisherId || null;

  const before = await prisma.guru.findUnique({ where: { id }, include: { publisher: { select: { name: true } } } });
  const guru = await prisma.guru.update({ where: { id }, data, include: { publisher: { select: { name: true } } } });

  // Log meaningful user actions as intelligence
  if (before && isSecondaryVoice === true && !before.isSecondaryVoice) {
    await logUserLearning({ content: `${guru.name} is a secondary voice / contributor, not a primary editor`, category: "GURU", guruId: id });
  }
  if (before && isSecondaryVoice === false && before.isSecondaryVoice) {
    await logUserLearning({ content: `${guru.name} is a primary editor (not a secondary voice)`, category: "GURU", guruId: id });
  }
  if (before && publisherId && publisherId !== before.publisherId && guru.publisher) {
    await logUserLearning({ content: `${guru.name} writes for / is associated with ${guru.publisher.name}`, category: "GURU", guruId: id, publisherId: publisherId });
  }
  if (before && isIgnored === true && !before.isIgnored) {
    await logUserLearning({ content: `${guru.name} marked as ignored — not a relevant editor`, category: "GURU", guruId: id });
  }

  return NextResponse.json(guru);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.guru.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
