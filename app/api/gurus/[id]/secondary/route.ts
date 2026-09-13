import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/api-auth";

// POST: assign a secondary voice to this primary guru
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { id: primaryGuruId } = await params;
  const { secondaryVoiceId } = await req.json();

  await prisma.secondaryVoiceGuru.upsert({
    where: { secondaryVoiceId_primaryGuruId: { secondaryVoiceId, primaryGuruId } },
    update: {},
    create: { secondaryVoiceId, primaryGuruId },
  });
  return NextResponse.json({ ok: true });
}

// DELETE: remove secondary voice from this primary guru
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { id: primaryGuruId } = await params;
  const { secondaryVoiceId } = await req.json();

  await prisma.secondaryVoiceGuru.deleteMany({
    where: { secondaryVoiceId, primaryGuruId },
  });
  return NextResponse.json({ ok: true });
}
