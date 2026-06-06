export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import PublishersClient from "@/components/publishers/PublishersClient";

export default async function PublishersPage() {
  const publishers = await prisma.publisher.findMany({
    include: { _count: { select: { emails: true } }, lists: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekCounts = await prisma.email.groupBy({
    by: ["publisherId"], _count: true,
    where: { publisherId: { not: null }, receivedAt: { gte: week } },
  });
  const weekMap = Object.fromEntries(weekCounts.map(w => [w.publisherId, w._count]));
  return <PublishersClient publishers={publishers} weekMap={weekMap} />;
}
