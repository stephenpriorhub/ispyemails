export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

import { notFound } from "next/navigation";
import EmailDetail from "@/components/emails/EmailDetail";
import { getServerIsAdmin } from "@/lib/server-role";

export default async function EmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isAdmin = await getServerIsAdmin();

  const [email, publishers, tags] = await Promise.all([
    prisma.email.findUnique({ where: { id }, include: { publisher: true, list: { select: { id: true, name: true } }, topics: { include: { topic: true } }, tags: { include: { tag: true } }, offer: true } }),
    prisma.publisher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!email) notFound();
  return <EmailDetail email={email} publishers={publishers} allTags={tags} isAdmin={isAdmin} />;
}
