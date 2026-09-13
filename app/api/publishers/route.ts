import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireApiUser } from "@/lib/api-auth";
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;
 return NextResponse.json(await prisma.publisher.findMany({include:{_count:{select:{emails:true}}},orderBy:{name:"asc"}})); }
export async function POST(req: NextRequest) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const { name, domains, website, notes } = await req.json();
  if (!name) return NextResponse.json({error:"Name required"},{status:400});
  return NextResponse.json(await prisma.publisher.create({data:{name,domains:domains??[],knownFromAddresses:[],website,notes,isConfirmed:true}}),{status:201});
}
