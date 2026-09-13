import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/api-auth";
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { id } = await params; await prisma.tag.delete({where:{id}}); return NextResponse.json({ok:true});
}
