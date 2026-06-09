export const dynamic = "force-dynamic";
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
