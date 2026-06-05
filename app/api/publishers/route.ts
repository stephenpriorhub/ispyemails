import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() { return NextResponse.json(await prisma.publisher.findMany({include:{_count:{select:{emails:true}}},orderBy:{name:"asc"}})); }
export async function POST(req: NextRequest) {
  const { name, domains, website, notes } = await req.json();
  if (!name) return NextResponse.json({error:"Name required"},{status:400});
  return NextResponse.json(await prisma.publisher.create({data:{name,domains:domains??[],knownFromAddresses:[],website,notes,isConfirmed:true}}),{status:201});
}
