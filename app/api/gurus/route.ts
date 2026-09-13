import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireApiUser } from "@/lib/api-auth";

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const gurus = await prisma.guru.findMany({
    include: {
      lists: {
        include: { list: { select: { id: true, name: true, publisher: { select: { id: true, name: true } } } } },
      },
      _count: { select: { emails: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(gurus);
}

export async function POST(req: NextRequest) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { name, notes, isSecondaryVoice } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const guru = await prisma.guru.upsert({
    where: { name },
    update: { notes },
    create: { name, notes, isSecondaryVoice: isSecondaryVoice ?? false },
  });
  return NextResponse.json(guru, { status: 201 });
}
