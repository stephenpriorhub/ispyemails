import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logUserLearning } from "@/lib/learnings";

// Secondary publishers are set MANUALLY only (rare multi-publisher gurus).
// The email analyzer never writes here — see lib/analyze.ts.

// POST: add a secondary publisher to a guru
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: guruId } = await params;
  const { publisherId } = await req.json();
  if (!publisherId) return NextResponse.json({ error: "publisherId required" }, { status: 400 });

  const guru = await prisma.guru.findUnique({ where: { id: guruId }, select: { name: true, publisherId: true } });
  if (!guru) return NextResponse.json({ error: "Guru not found" }, { status: 404 });
  if (guru.publisherId === publisherId) {
    return NextResponse.json({ error: "That publisher is already this guru's primary publisher." }, { status: 409 });
  }

  await prisma.guruSecondaryPublisher.upsert({
    where: { guruId_publisherId: { guruId, publisherId } },
    update: {},
    create: { guruId, publisherId },
  });

  const publisher = await prisma.publisher.findUnique({ where: { id: publisherId }, select: { name: true } });
  if (publisher) {
    await logUserLearning({
      content: `${guru.name} is also published by ${publisher.name} (secondary publisher, manually confirmed)`,
      category: "GURU",
      guruId,
      publisherId,
    });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: remove a secondary publisher from a guru
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: guruId } = await params;
  const { publisherId } = await req.json();
  if (!publisherId) return NextResponse.json({ error: "publisherId required" }, { status: 400 });

  await prisma.guruSecondaryPublisher.deleteMany({ where: { guruId, publisherId } });
  return NextResponse.json({ ok: true });
}
