export const dynamic = "force-dynamic";
// isAdmin: client-side auth handles role gating via AppShell/Sidebar
import { prisma } from "@/lib/prisma";
import { getServerIsAdmin } from "@/lib/server-role";

import GurusManager from "@/components/gurus/GurusManager";

export default async function GurusPage() {
  const isAdmin = await getServerIsAdmin();


  const [gurus, lists, publishers] = await Promise.all([
    prisma.guru.findMany({
      include: {
        publisher: { select: { id: true, name: true } },
        lists: { include: { list: { select: { id: true, name: true, publisher: { select: { id: true, name: true } } } } } },
        primaryGurus: { include: { primaryGuru: { select: { id: true, name: true } } } },
        secondaryVoices: { include: { secondaryVoice: { select: { id: true, name: true } } } },
        _count: { select: { emails: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.list.findMany({ where: { isIgnored: false }, orderBy: { name: "asc" }, select: { id: true, name: true, publisher: { select: { id: true, name: true } } } }),
    prisma.publisher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <GurusManager gurus={gurus as any} lists={lists} publishers={publishers} isAdmin={isAdmin} />;
}
