import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeEmail } from "@/lib/analyze";
export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const email = await prisma.email.findUnique({ where:{id}, include:{publisher:true,topics:{include:{topic:true}},tags:{include:{tag:true}},offer:true} });
  if (!email) return NextResponse.json({ error:"Not found" },{status:404});
  return NextResponse.json(email);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const body = await req.json();
  const { publisherId, publisherConfirmed, listId, listConfirmed, emailType, emailTypeConfirmed, tagIds, topicIds } = body;
  const updateData: Record<string,unknown> = {};
  if (publisherId !== undefined) updateData.publisherId = publisherId;
  if (publisherConfirmed !== undefined) updateData.publisherConfirmed = publisherConfirmed;
  if (listId !== undefined) updateData.listId = listId;
  if (listConfirmed !== undefined) updateData.listConfirmed = listConfirmed;
  if (emailType !== undefined) updateData.emailType = emailType;
  if (emailTypeConfirmed !== undefined) updateData.emailTypeConfirmed = emailTypeConfirmed;
  if (tagIds !== undefined) updateData.tags = { deleteMany:{}, create:(tagIds as string[]).map((tagId)=>({tagId})) };
  if (topicIds !== undefined) updateData.topics = { deleteMany:{}, create:(topicIds as string[]).map((topicId)=>({topicId, confidence:1.0})) };
  const email = await prisma.email.update({ where:{id}, data:updateData, include:{publisher:true,list:{select:{id:true,name:true}},topics:{include:{topic:true}},tags:{include:{tag:true}},offer:true} });
  if (publisherId && publisherConfirmed) {
    const e = await prisma.email.findUnique({ where:{id}, select:{fromEmail:true} });
    if (e) { const pub = await prisma.publisher.findUnique({where:{id:publisherId}}); if (pub && !pub.knownFromAddresses.includes(e.fromEmail)) await prisma.publisher.update({where:{id:publisherId},data:{knownFromAddresses:{push:e.fromEmail}}}); }
  }
  return NextResponse.json(email);
}
export async function POST(_req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const email = await prisma.email.findUnique({ where:{id} });
  if (!email) return NextResponse.json({error:"Not found"},{status:404});
  await analyzeEmail(email.id, email.subject, email.fromName??"", email.fromEmail, email.bodyText, email.bodyHtml, email.toEmail);
  return NextResponse.json(await prisma.email.findUnique({where:{id},include:{publisher:true,topics:{include:{topic:true}},tags:{include:{tag:true}},offer:true}}));
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  await prisma.email.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
