import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = await req.json();
  const learning = await prisma.learning.update({ where: { id }, data: { status } });
  return NextResponse.json(learning);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.learning.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
