export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import IntelligenceClient from "@/components/IntelligenceClient";

export default async function IntelligencePage() {
  const [pending, validated] = await Promise.all([
    prisma.learning.findMany({
      where: { status: "PENDING" },
      select: {
        id: true, content: true, source: true, category: true, status: true,
        createdAt: true, isContradicted: true, contradictionNote: true,
        email: { select: { id: true, subject: true } },
        guru: { select: { id: true, name: true } },
        publisher: { select: { id: true, name: true } },
        list: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.learning.findMany({
      where: { status: "VALIDATED" },
      select: {
        id: true, content: true, source: true, category: true, status: true,
        createdAt: true, isContradicted: true, contradictionNote: true,
        email: { select: { id: true, subject: true } },
        guru: { select: { id: true, name: true } },
        publisher: { select: { id: true, name: true } },
        list: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return <IntelligenceClient pending={pending} validated={validated} />;
}
