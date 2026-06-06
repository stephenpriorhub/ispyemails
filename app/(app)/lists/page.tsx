export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import ListsManager from "@/components/lists/ListsManager";

export default async function ListsPage() {
  const [lists, publishers] = await Promise.all([
    prisma.list.findMany({
      include: {
        publisher: { select: { id: true, name: true } },
        gurus: {
          where: { isIgnored: false },
          include: { guru: { select: { id: true, name: true, isIgnored: true } } },
        },
        _count: { select: { emails: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.publisher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <ListsManager lists={lists} publishers={publishers} />;
}
