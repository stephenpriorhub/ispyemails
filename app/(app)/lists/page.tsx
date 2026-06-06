export const dynamic = "force-dynamic";
// isAdmin: client-side auth handles role gating via AppShell/Sidebar
import { prisma } from "@/lib/prisma";
import { getServerIsAdmin } from "@/lib/server-role";

import ListsManager from "@/components/lists/ListsManager";

export default async function ListsPage() {
  const isAdmin = await getServerIsAdmin();


  const staleThreshold = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  const [lists, publishers, primaryGurus] = await Promise.all([
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
    // Primary editors only (not secondary voices)
    prisma.guru.findMany({
      where: { isIgnored: false, isSecondaryVoice: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const lastEmails = await Promise.all(
    lists.map(async (l) => {
      const last = await prisma.email.findFirst({ where: { listId: l.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
      return { id: l.id, lastEmail: last?.receivedAt ?? null };
    })
  );
  const lastEmailMap = Object.fromEntries(lastEmails.map(l => [l.id, l.lastEmail]));

  const listsWithMeta = lists.map(l => ({
    ...l,
    lastEmail: lastEmailMap[l.id] ?? null,
    isStale: lastEmailMap[l.id] !== null && lastEmailMap[l.id]! < staleThreshold,
  }));

  return <ListsManager lists={listsWithMeta} publishers={publishers} primaryGurus={primaryGurus} isAdmin={isAdmin} />;
}
