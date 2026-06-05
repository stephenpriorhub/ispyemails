export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import TagsManager from "@/components/TagsManager";
export default async function TagsPage() {
  return <TagsManager tags={await prisma.tag.findMany({include:{_count:{select:{emails:true}}},orderBy:{name:"asc"}})} />;
}
