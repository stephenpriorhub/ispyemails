import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const lists = await prisma.list.findMany({
    include: {
      publisher: { select: { id: true, name: true, type: true } },
      gurus: { include: { guru: { select: { id: true, name: true, isIgnored: true } } } },
      _count: { select: { emails: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(lists);
}

export async function POST(req: NextRequest) {
  const { name, category, publisherId, notes } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const list = await prisma.list.create({
    data: { name, category: category ?? "FREE_EDITORIAL", publisherId: publisherId || null, notes },
    include: { publisher: { select: { id: true, name: true } }, _count: { select: { emails: true } } },
  });
  return NextResponse.json(list, { status: 201 });
}
