export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Mail, Users, TrendingUp, Inbox } from "lucide-react";
const placementColors: Record<string,string> = { PRIMARY:"text-green-400 bg-green-400/10", PROMOTIONS:"text-amber-400 bg-amber-400/10", SPAM:"text-red-400 bg-red-400/10", UPDATES:"text-blue-400 bg-blue-400/10", UNKNOWN:"text-gray-400 bg-gray-400/10" };
export default async function DashboardPage() {
  const now = new Date(), today = new Date(now.getFullYear(),now.getMonth(),now.getDate()), week = new Date(now.getTime()-7*24*60*60*1000);
  const [totalEmails,todayEmails,weekEmails,totalPublishers,recentEmails,placementBreakdown,topTopics] = await Promise.all([
    prisma.email.count(), prisma.email.count({where:{receivedAt:{gte:today}}}), prisma.email.count({where:{receivedAt:{gte:week}}}), prisma.publisher.count(),
    prisma.email.findMany({where:{receivedAt:{gte:today}},orderBy:{receivedAt:"desc"},take:15,include:{publisher:{select:{id:true,name:true}},topics:{include:{topic:{select:{name:true}}}}}}),
    prisma.email.groupBy({by:["inboxPlacement"],_count:true,where:{receivedAt:{gte:week}}}),
    prisma.emailTopic.groupBy({by:["topicId"],_count:true,where:{email:{receivedAt:{gte:today}}},orderBy:{_count:{topicId:"desc"}},take:8}),
  ]);
  const topicIds = topTopics.map(t=>t.topicId);
  const topicDetails = await prisma.topic.findMany({where:{id:{in:topicIds}}});
  const topTopicsNamed = topTopics.map(t=>({count:t._count,name:topicDetails.find(td=>td.id===t.topicId)?.name??"unknown"}));
  const stats = [{label:"Total Emails",value:totalEmails.toLocaleString(),icon:Mail},{label:"Today",value:todayEmails,icon:Inbox},{label:"This Week",value:weekEmails,icon:TrendingUp},{label:"Publishers",value:totalPublishers,icon:Users}];
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Daily Brief</h1><p className="text-gray-400 text-sm mt-1">{now.toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p></div>
      <div className="grid grid-cols-4 gap-4">{stats.map(({label,value,icon:Icon})=><div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4"><div className="flex items-center gap-2 text-gray-400 text-xs mb-2"><Icon className="w-3.5 h-3.5"/>{label}</div><div className="text-2xl font-bold text-white">{value}</div></div>)}</div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between"><h2 className="font-semibold text-white text-sm">Today&apos;s Emails</h2><Link href="/emails" className="text-xs text-amber-400 hover:underline">View all →</Link></div>
          <div className="divide-y divide-gray-800">
            {recentEmails.length===0?<p className="p-4 text-gray-500 text-sm">No emails today yet.</p>:recentEmails.map(email=>(
              <Link key={email.id} href={`/emails/${email.id}`} className="flex items-start gap-3 p-3 hover:bg-gray-800/50 transition-colors">
                <span className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${placementColors[email.inboxPlacement]??placementColors.UNKNOWN}`}>{email.inboxPlacement==="PRIMARY"?"✓":email.inboxPlacement==="SPAM"?"✗":"~"}</span>
                <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{email.subject}</p><p className="text-xs text-gray-500 mt-0.5">{email.publisher?.name??email.fromEmail} · {new Date(email.receivedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p></div>
                <div className="flex gap-1">{email.topics.slice(0,2).map(({topic})=><span key={topic.name} className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{topic.name}</span>)}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4"><h2 className="font-semibold text-white text-sm mb-3">Inbox Placement (7d)</h2><div className="space-y-2">{placementBreakdown.map(p=><div key={p.inboxPlacement} className="flex items-center justify-between"><span className={`text-xs px-2 py-0.5 rounded font-medium ${placementColors[p.inboxPlacement]??placementColors.UNKNOWN}`}>{p.inboxPlacement}</span><span className="text-sm font-semibold text-white">{p._count}</span></div>)}{placementBreakdown.length===0&&<p className="text-xs text-gray-500">No data yet</p>}</div></div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4"><h2 className="font-semibold text-white text-sm mb-3">Hot Topics Today</h2><div className="space-y-2">{topTopicsNamed.map(({name,count})=><div key={name} className="flex items-center justify-between"><span className="text-xs text-gray-300 capitalize">{name}</span><span className="text-xs font-semibold text-amber-400">{count}</span></div>)}{topTopicsNamed.length===0&&<p className="text-xs text-gray-500">No topics yet today</p>}</div></div>
        </div>
      </div>
    </div>
  );
}
