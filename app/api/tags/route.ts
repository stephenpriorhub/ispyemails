import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() { return NextResponse.json(await prisma.tag.findMany({include:{_count:{select:{emails:true}}},orderBy:{name:"asc"}})); }
export async function POST(req: NextRequest) {
  const { name, color } = await req.json();
  if (!name) return NextResponse.json({error:"Name required"},{status:400});
  return NextResponse.json(await prisma.tag.create({data:{name,color:color??"#6B7280"}}),{status:201});
}
