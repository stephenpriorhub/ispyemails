import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
  const { name, bio, notes } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const guru = await prisma.guru.upsert({
    where: { name },
    update: { bio, notes },
    create: { name, bio, notes },
  });
  return NextResponse.json(guru, { status: 201 });
}
