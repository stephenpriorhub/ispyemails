export const dynamic = "force-dynamic";
// isAdmin: client-side auth handles role gating via AppShell/Sidebar
import { prisma } from "@/lib/prisma";
import TopicsManager from "@/components/TopicsManager";

export default async function TopicsPage() {
  return (
    <TopicsManager
      topics={await prisma.topic.findMany({
        include: { _count: { select: { emails: true } } },
        orderBy: [{ isIgnored: "asc" }, { name: "asc" }],
      })}
    />
  );
}
