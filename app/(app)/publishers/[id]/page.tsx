export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, TrendingUp, Calendar } from "lucide-react";
const pColors: Record<string,string> = { PRIMARY:"bg-green-500/10 text-green-400", PROMOTIONS:"bg-amber-500/10 text-amber-400", SPAM:"bg-red-500/10 text-red-400", UNKNOWN:"bg-gray-500/10 text-gray-400" };
export default async function PublisherDetailPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const publisher = await prisma.publisher.findUnique({where:{id},include:{emails:{orderBy:{receivedAt:"desc"},take:20,include:{topics:{include:{topic:true}},offer:true}},_count:{select:{emails:true}}}});
  if (!publisher) notFound();
  const now = new Date(), d7 = new Date(now.getTime()-7*24*60*60*1000), d30 = new Date(now.getTime()-30*24*60*60*1000);
  const [last7d,last30d,topTopics,typeSplit,placementSplit] = await Promise.all([
    prisma.email.count({where:{publisherId:id,receivedAt:{gte:d7}}}),
    prisma.email.count({where:{publisherId:id,receivedAt:{gte:d30}}}),
    prisma.emailTopic.groupBy({by:["topicId"],_count:true,where:{email:{publisherId:id}},orderBy:{_count:{topicId:"desc"}},take:10}),
    prisma.email.groupBy({by:["emailType"],_count:true,where:{publisherId:id}}),
    prisma.email.groupBy({by:["inboxPlacement"],_count:true,where:{publisherId:id}}),
  ]);
  const topicDetails = await prisma.topic.findMany({where:{id:{in:topTopics.map(t=>t.topicId)}}});
  const topTopicsNamed = topTopics.map(t=>({count:t._count,name:topicDetails.find(td=>td.id===t.topicId)?.name??"unknown"}));
  const avgPerWeek = Math.round(publisher._count.emails/Math.max(1,Math.ceil((Date.now()-new Date(publisher.createdAt).getTime())/(7*24*60*60*1000))));
  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/publishers" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mb-3"><ArrowLeft className="w-3.5 h-3.5"/>Publishers</Link>
        <div className="flex items-start justify-between">
          <div><h1 className="text-2xl font-bold text-white">{publisher.name}</h1>{publisher.website&&<a href={publisher.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-1 block">{publisher.website}</a>}</div>
          <Link href={`/emails?publisher=${id}`} className="px-3 py-1.5 bg-amber-500/10 text-amber-400 text-sm rounded hover:bg-amber-500/20 transition-colors">View All Emails →</Link>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[{label:"Total",value:publisher._count.emails,icon:Mail},{label:"Last 7d",value:last7d,icon:Calendar},{label:"Last 30d",value:last30d,icon:TrendingUp},{label:"Avg/Week",value:avgPerWeek,icon:TrendingUp}].map(({label,value,icon:Icon})=>(
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4"><div className="flex items-center gap-2 text-gray-400 text-xs mb-2"><Icon className="w-3.5 h-3.5"/>{label}</div><div className="text-2xl font-bold text-white">{value}</div></div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg">
          <div className="p-4 border-b border-gray-800"><h2 className="font-semibold text-white text-sm">Recent Emails</h2></div>
          <div className="divide-y divide-gray-800">
            {publisher.emails.map(email=>(
              <Link key={email.id} href={`/emails/${email.id}`} className="flex items-start gap-3 p-3 hover:bg-gray-800/50 transition-colors">
                <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{email.subject}</p><p className="text-xs text-gray-500 mt-0.5">{new Date(email.receivedAt).toLocaleDateString()}{email.offer?.promise&&<span className="text-amber-400 ml-2 truncate max-w-48"> {email.offer.promise.substring(0,50)}…</span>}</p></div>
                <div className="flex gap-1">{email.topics.slice(0,2).map(({topic})=><span key={topic.id} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded capitalize">{topic.name}</span>)}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4"><h3 className="font-semibold text-white text-sm mb-3">Top Topics</h3><div className="space-y-2">{topTopicsNamed.map(({name,count})=><div key={name} className="flex items-center justify-between"><span className="text-xs text-gray-300 capitalize">{name}</span><span className="text-xs font-semibold text-amber-400">{count}</span></div>)}{topTopicsNamed.length===0&&<p className="text-xs text-gray-500">No topics yet</p>}</div></div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4"><h3 className="font-semibold text-white text-sm mb-3">Email Types</h3><div className="space-y-2">{typeSplit.map(t=><div key={t.emailType} className="flex items-center justify-between"><span className="text-xs text-gray-300">{t.emailType.replace("_"," ")}</span><span className="text-xs font-semibold text-white">{t._count}</span></div>)}</div></div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4"><h3 className="font-semibold text-white text-sm mb-3">Inbox Placement</h3><div className="space-y-2">{placementSplit.map(p=><div key={p.inboxPlacement} className="flex items-center justify-between"><span className={`text-xs px-1.5 py-0.5 rounded ${pColors[p.inboxPlacement]??pColors.UNKNOWN}`}>{p.inboxPlacement}</span><span className="text-xs font-semibold text-white">{p._count}</span></div>)}</div></div>
        </div>
      </div>
    </div>
  );
}
