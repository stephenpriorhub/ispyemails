export const dynamic = "force-dynamic";
// isAdmin: client-side auth handles role gating via AppShell/Sidebar
import { prisma } from "@/lib/prisma";
import TagsManager from "@/components/TagsManager";
export default async function TagsPage() {
  return <TagsManager tags={await prisma.tag.findMany({include:{_count:{select:{emails:true}}},orderBy:{name:"asc"}})} />;
}
