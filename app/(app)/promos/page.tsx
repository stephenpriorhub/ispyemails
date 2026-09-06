export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getServerIsAdmin } from "@/lib/server-role";
import PromoFeed from "@/components/promos/PromoFeed";

export default async function PromosPage() {
  const [isAdmin, publishers, lists] = await Promise.all([
    getServerIsAdmin(),
    prisma.publisher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.list.findMany({ where: { isIgnored: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <PromoFeed publishers={publishers} lists={lists} isAdmin={isAdmin} />;
}
