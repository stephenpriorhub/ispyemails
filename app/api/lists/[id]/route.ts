import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/api-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const list = await prisma.list.update({ where: { id }, data: body });
  return NextResponse.json(list);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { id } = await params;
  await prisma.list.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
