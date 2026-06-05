import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get("page") ?? "1"), limit = parseInt(sp.get("limit") ?? "50");
  const where: Record<string,unknown> = {};
  if (sp.get("publisher")) where.publisherId = sp.get("publisher");
  if (sp.get("placement")) where.inboxPlacement = sp.get("placement");
  if (sp.get("type")) where.emailType = sp.get("type");
  if (sp.get("topic")) where.topics = { some: { topicId: sp.get("topic") } };
  if (sp.get("tag")) where.tags = { some: { tagId: sp.get("tag") } };
  if (sp.get("q")) where.OR = [{ subject:{contains:sp.get("q")!,mode:"insensitive"} },{ bodyText:{contains:sp.get("q")!,mode:"insensitive"} },{ fromName:{contains:sp.get("q")!,mode:"insensitive"} },{ fromEmail:{contains:sp.get("q")!,mode:"insensitive"} }];
  const sortBy = sp.get("sort") ?? "receivedAt", order = (sp.get("order") ?? "desc") as "asc"|"desc";
  const [emails, total] = await Promise.all([
    prisma.email.findMany({ where, include: { publisher:{select:{id:true,name:true}}, topics:{include:{topic:{select:{id:true,name:true,color:true}}}}, tags:{include:{tag:{select:{id:true,name:true,color:true}}}}, offer:{select:{url:true,promise:true}} }, orderBy:{[sortBy]:order}, skip:(page-1)*limit, take:limit }),
    prisma.email.count({ where }),
  ]);
  return NextResponse.json({ emails, total, page, pages: Math.ceil(total/limit) });
}
