export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUser, isAdminRole } from "@/lib/auth";
import GurusManager from "@/components/gurus/GurusManager";

export default async function GurusPage() {
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
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
