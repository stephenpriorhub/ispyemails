import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "PENDING";
  const limit = parseInt(sp.get("limit") ?? "50");

  const learnings = await prisma.learning.findMany({
    where: status !== "all" ? { status: status as "PENDING" | "VALIDATED" | "IGNORED" } : undefined,
    include: {
      email: { select: { id: true, subject: true, receivedAt: true } },
      guru: { select: { id: true, name: true } },
      publisher: { select: { id: true, name: true } },
      list: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(learnings);
}

export async function POST(req: NextRequest) {
  const { content, source, category, emailId, guruId, publisherId, listId } = await req.json();
  const learning = await prisma.learning.create({
    data: { content, source, category: category ?? "GENERAL", emailId, guruId, publisherId, listId },
  });
  return NextResponse.json(learning, { status: 201 });
}

// DELETE: remove pending learnings that duplicate validated knowledge,
// and backfill contradiction notes on any flagged items missing them.
export async function DELETE() {
  const { cleanupDuplicateLearnings, backfillContradictionNotes } = await import("@/lib/learnings");
  const [removed, notesAdded] = await Promise.all([
    cleanupDuplicateLearnings(),
    backfillContradictionNotes(),
  ]);
  return NextResponse.json({ ok: true, removed, notesAdded });
}
