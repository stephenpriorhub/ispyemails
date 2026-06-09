export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getServerIsAdmin } from "@/lib/server-role";
import PublishersClient from "@/components/publishers/PublishersClient";

export default async function PublishersPage() {
  const isAdmin = await getServerIsAdmin();

  const staleThreshold = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  const publishers = await prisma.publisher.findMany({
    include: { _count: { select: { emails: true } }, lists: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const lastEmails = await Promise.all(publishers.map(async (p) => {
    const last = await prisma.email.findFirst({ where: { publisherId: p.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
    return { id: p.id, lastEmail: last?.receivedAt ?? null };
  }));
  const lastEmailMap = Object.fromEntries(lastEmails.map(l => [l.id, l.lastEmail]));

  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekCounts = await prisma.email.groupBy({
    by: ["publisherId"], _count: true,
    where: { publisherId: { not: null }, receivedAt: { gte: week } },
  });
  const weekMap = Object.fromEntries(weekCounts.map(w => [w.publisherId, w._count]));

  const publishersWithMeta = publishers.map(p => ({
    ...p,
    lastEmail: lastEmailMap[p.id] ?? null,
    isStale: lastEmailMap[p.id] !== null && lastEmailMap[p.id]! < staleThreshold,
  }));

  return <PublishersClient publishers={publishersWithMeta} weekMap={weekMap} isAdmin={isAdmin} />;
}
