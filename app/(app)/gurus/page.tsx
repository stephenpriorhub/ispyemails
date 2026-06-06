export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import GurusManager from "@/components/gurus/GurusManager";

export default async function GurusPage() {
  const [gurus, lists, publishers] = await Promise.all([
    prisma.guru.findMany({
      include: {
        lists: { include: { list: { select: { id: true, name: true, publisher: { select: { id: true, name: true } } } } } },
        _count: { select: { emails: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.list.findMany({
      where: { isIgnored: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, publisher: { select: { id: true, name: true } } },
    }),
    prisma.publisher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <GurusManager gurus={gurus} lists={lists} publishers={publishers} />;
}
