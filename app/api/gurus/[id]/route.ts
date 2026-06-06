import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const guru = await prisma.guru.update({ where: { id }, data });
  return NextResponse.json(guru);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.guru.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
