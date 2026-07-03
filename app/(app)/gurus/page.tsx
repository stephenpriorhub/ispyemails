export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getServerIsAdmin } from "@/lib/server-role";
import GurusManager from "@/components/gurus/GurusManager";

export default async function GurusPage() {
  const isAdmin = await getServerIsAdmin();
  const staleThreshold = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  const [gurus, lists, publishers, staleGuruRows] = await Promise.all([
    prisma.guru.findMany({
      include: {
        publisher: { select: { id: true, name: true } },
        lists: { include: { list: { select: { id: true, name: true, category: true, publisher: { select: { id: true, name: true } } } } } },
        primaryGurus: { include: { primaryGuru: { select: { id: true, name: true } } } },
        secondaryVoices: { include: { secondaryVoice: { select: { id: true, name: true } } } },
        secondaryPublishers: { include: { publisher: { select: { id: true, name: true } } } },
        _count: { select: { emails: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.list.findMany({ where: { isIgnored: false }, orderBy: { name: "asc" }, select: { id: true, name: true, publisher: { select: { id: true, name: true } } } }),
    prisma.publisher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Gurus that went silent: seen before but no email in 6+ days
    prisma.guru.findMany({
      where: {
        isIgnored: false,
        isSecondaryVoice: false,
        emails: { some: { email: { receivedAt: { lt: staleThreshold } } }, none: { email: { receivedAt: { gte: staleThreshold } } } },
      },
      select: { id: true, name: true },
    }),
  ]);

  // Last email date for each silent guru
  const staleGurus = await Promise.all(
    staleGuruRows.map(async (g) => {
      const last = await prisma.email.findFirst({ where: { gurus: { some: { guruId: g.id } } }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
      return { id: g.id, name: g.name, lastEmail: last?.receivedAt ?? null };
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <GurusManager gurus={gurus as any} lists={lists} publishers={publishers} staleGurus={staleGurus} isAdmin={isAdmin} />;
}
