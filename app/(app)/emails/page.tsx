export const dynamic = "force-dynamic";
// isAdmin: client-side auth handles role gating via AppShell/Sidebar
import { prisma } from "@/lib/prisma";


import EmailList from "@/components/emails/EmailList";

export default async function EmailsPage({
  searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;



  const page = parseInt(sp.page ?? "1"), limit = 50;
  const where: Record<string, unknown> = {};
  if (sp.publisher) where.publisherId = sp.publisher;
  if (sp.placement) where.inboxPlacement = sp.placement;
  if (sp.type) where.emailType = sp.type;
  if (sp.topic) where.topics = { some: { topicId: sp.topic } };
  if (sp.list) where.listId = sp.list;
  if (sp.guru) {
    const secondaryVoices = await prisma.secondaryVoiceGuru.findMany({ where: { primaryGuruId: sp.guru }, select: { secondaryVoiceId: true } });
    const allGuruIds = [sp.guru, ...secondaryVoices.map(sv => sv.secondaryVoiceId)];
    where.gurus = { some: { guruId: { in: allGuruIds } } };
  }
  if (sp.q) where.OR = [{ subject:{contains:sp.q,mode:"insensitive"} },{ bodyText:{contains:sp.q,mode:"insensitive"} },{ fromName:{contains:sp.q,mode:"insensitive"} },{ fromEmail:{contains:sp.q,mode:"insensitive"} }];
  const sortBy = sp.sort ?? "receivedAt", order = (sp.order ?? "desc") as "asc"|"desc";
  const [emails,total,publishers,topics,lists,gurus] = await Promise.all([
    prisma.email.findMany({ where, include:{ publisher:{select:{id:true,name:true,type:true}}, list:{select:{id:true,name:true}}, gurus:{include:{guru:{select:{id:true,name:true,isSecondaryVoice:true}}}}, topics:{include:{topic:{select:{id:true,name:true,color:true}}}}, tags:{include:{tag:{select:{id:true,name:true,color:true}}}}, offer:{select:{url:true,promise:true}} }, orderBy:{[sortBy]:order}, skip:(page-1)*limit, take:limit }),
    prisma.email.count({ where }),
    prisma.publisher.findMany({ orderBy:{name:"asc"}, select:{id:true,name:true} }),
    prisma.topic.findMany({ where:{isIgnored:false}, orderBy:{name:"asc"}, select:{id:true,name:true} }),
    prisma.list.findMany({ where:{isIgnored:false}, orderBy:{name:"asc"}, select:{id:true,name:true} }),
    prisma.guru.findMany({ where:{isIgnored:false,isSecondaryVoice:false}, orderBy:{name:"asc"}, select:{id:true,name:true} }),
  ]);
  return <EmailList emails={emails} total={total} page={page} pages={Math.ceil(total/limit)} publishers={publishers} topics={topics} lists={lists} gurus={gurus} filters={{ publisherId:sp.publisher, topicId:sp.topic, placement:sp.placement, emailType:sp.type, search:sp.q, listId:sp.list, guruId:sp.guru, sortBy, order }} isAdmin={true} />;
}
