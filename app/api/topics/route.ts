import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireApiUser } from "@/lib/api-auth";
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;
 return NextResponse.json(await prisma.topic.findMany({include:{_count:{select:{emails:true}}},orderBy:[{isIgnored:"asc"},{name:"asc"}]})); }
export async function POST(req: NextRequest) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { name, color } = await req.json();
  return NextResponse.json(await prisma.topic.upsert({where:{name:name.toLowerCase()},update:{color},create:{name:name.toLowerCase(),color}}),{status:201});
}
