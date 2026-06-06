import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guru = await prisma.guru.findUnique({
    where: { id },
    include: {
      lists: { include: { list: { include: { publisher: true, _count: { select: { emails: true } } } } } },
      emails: { take: 20, include: { email: { select: { id: true, subject: true, receivedAt: true, publisher: { select: { name: true } }, list: { select: { name: true } } } } }, orderBy: { email: { receivedAt: "desc" } } },
      _count: { select: { emails: true } },
    },
  });
  if (!guru) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(guru);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Handle list assignments if provided
  if (body.listIds !== undefined) {
    await prisma.guruList.deleteMany({ where: { guruId: id } });
    for (const listId of body.listIds) {
      await prisma.guruList.create({ data: { guruId: id, listId, isPrimary: body.primaryListId === listId } });
    }
    delete body.listIds;
    delete body.primaryListId;
  }

  const guru = await prisma.guru.update({ where: { id }, data: body });
  return NextResponse.json(guru);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.guru.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
