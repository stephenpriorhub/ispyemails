"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";

const PLACEMENTS = ["PRIMARY","PROMOTIONS","SPAM","UPDATES","SOCIAL","UNKNOWN"];
const TYPES = ["LIFT_NOTE","EDITORIAL","PROMO","UNKNOWN"];
const pBadge: Record<string,string> = {
  PRIMARY:"bg-green-500/10 text-green-400 border-green-500/20",
  PROMOTIONS:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  SPAM:"bg-red-500/10 text-red-400 border-red-500/20",
  UPDATES:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  UNKNOWN:"bg-gray-500/10 text-gray-400 border-gray-500/20",
};
const tBadge: Record<string,string> = {
  LIFT_NOTE:"bg-pink-500/10 text-pink-300",
  EDITORIAL:"bg-cyan-500/10 text-cyan-300",
  PROMO:"bg-orange-500/10 text-orange-300",
  UNKNOWN:"bg-gray-500/10 text-gray-400",
};

interface EmailRow {
  id:string; subject:string; fromName:string|null; fromEmail:string;
  receivedAt:Date|string; inboxPlacement:string; emailType:string; publisherConfirmed:boolean;
  publisher:{id:string;name:string;type?:string}|null;
  list?:{id:string;name:string}|null;
  gurus?:{guru:{id:string;name:string;isSecondaryVoice:boolean}}[];
  topics:{topic:{id:string;name:string;color:string|null}}[];
  tags:{tag:{id:string;name:string;color:string}}[];
  offer:{url:string|null;promise:string|null}|null;
}
interface Props {
  emails:EmailRow[]; total:number; page:number; pages:number;
  publishers:{id:string;name:string}[];
  topics:{id:string;name:string}[];
  lists?:{id:string;name:string}[];
  gurus?:{id:string;name:string}[];
  filters:{
    publisherId?:string; topicId?:string; placement?:string; emailType?:string;
    search?:string; listId?:string; guruId?:string; sortBy:string; order:string;
  };
  isAdmin?: boolean;
}

export default function EmailList({ emails,total,page,pages,publishers,topics,lists=[],gurus=[],filters }: Props) {
  const router = useRouter(), sp = useSearchParams();

  function updateFilter(key:string, value:string|null) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key,value); else params.delete(key);
    params.delete("page");
    router.push(`/emails?${params.toString()}`);
  }

  function handleSearch(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value;
    updateFilter("q", q||null);
  }

  function makePageUrl(p:number) {
    const params = new URLSearchParams(sp.toString());
    params.set("page",String(p));
    return `/emails?${params.toString()}`;
  }

  // Active filter chips
  const activeFilters = [
    filters.publisherId && { key:"publisher", label:`Publisher: ${publishers.find(p=>p.id===filters.publisherId)?.name??filters.publisherId}` },
    filters.listId && { key:"list", label:`List: ${lists.find(l=>l.id===filters.listId)?.name??filters.listId}` },
    filters.guruId && { key:"guru", label:`Guru: ${gurus.find(g=>g.id===filters.guruId)?.name??filters.guruId}` },
    filters.topicId && { key:"topic", label:`Topic: ${filters.topicId}` },
    filters.placement && { key:"placement", label:filters.placement },
    filters.emailType && { key:"type", label:filters.emailType.replace("_"," ") },
    filters.search && { key:"q", label:`"${filters.search}"` },
  ].filter(Boolean) as {key:string;label:string}[];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 bg-gray-900 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">Emails <span className="text-gray-500 text-sm font-normal ml-1">{total.toLocaleString()} total</span></h1>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map(f => (
              <span key={f.key} className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs">
                {f.label}
                <button onClick={() => updateFilter(f.key, null)} className="hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button onClick={() => router.push("/emails")} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-800">Clear all</button>
          </div>
        )}

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"/>
              <input name="q" defaultValue={filters.search??""} placeholder="Search…" className="pl-7 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 w-48"/>
            </div>
          </form>

          <select value={filters.publisherId??""} onChange={e=>updateFilter("publisher",e.target.value||null)} className="py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="">All Publishers</option>
            {publishers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {lists.length > 0 && (
            <select value={filters.listId??""} onChange={e=>updateFilter("list",e.target.value||null)} className="py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
              <option value="">All Lists</option>
              {lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}

          {gurus.length > 0 && (
            <select value={filters.guruId??""} onChange={e=>updateFilter("guru",e.target.value||null)} className="py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
              <option value="">All Gurus</option>
              {gurus.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}

          <select value={filters.topicId??""} onChange={e=>updateFilter("topic",e.target.value||null)} className="py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="">All Topics</option>
            {topics.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select value={filters.placement??""} onChange={e=>updateFilter("placement",e.target.value||null)} className="py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="">All Placements</option>
            {PLACEMENTS.map(p=><option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filters.emailType??""} onChange={e=>updateFilter("type",e.target.value||null)} className="py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="">All Types</option>
            {TYPES.map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium w-28">Placement</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Subject</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium w-36">List</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium w-24">Type</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium w-44">Topics</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium w-24">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {emails.map(email=>(
              <tr key={email.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-medium ${pBadge[email.inboxPlacement]??pBadge.UNKNOWN}`}>{email.inboxPlacement}</span>
                </td>
                <td className="px-4 py-2.5">
                  {email.publisher && (
                    <button onClick={()=>updateFilter("publisher",email.publisher!.id)} className="inline-flex mb-1 px-1.5 py-0.5 text-xs bg-gray-800 text-gray-500 hover:text-amber-400 rounded border border-gray-700/50 hover:border-amber-500/30 transition-colors leading-none">{email.publisher.name}</button>
                  )}
                  <Link href={`/emails/${email.id}`} className="text-white hover:text-amber-400 transition-colors line-clamp-1 block">{email.subject}</Link>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{email.fromName?`${email.fromName} <${email.fromEmail}>`:email.fromEmail}</p>
                </td>
                <td className="px-4 py-2.5">
                  {email.list ? (
                    <button onClick={()=>updateFilter("list",email.list!.id)} className="text-xs text-gray-400 hover:text-amber-400 hover:underline">{email.list.name}</button>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${tBadge[email.emailType]??tBadge.UNKNOWN}`}>{email.emailType.replace("_"," ")}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {email.topics.slice(0,3).map(({topic})=>(
                      <button key={topic.id} onClick={()=>updateFilter("topic",topic.id)} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded capitalize">{topic.name}</button>
                    ))}
                    {email.topics.length>3&&<span className="text-xs text-gray-500">+{email.topics.length-3}</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {new Date(email.receivedAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                  <br/>{new Date(email.receivedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                </td>
              </tr>
            ))}
            {emails.length===0&&<tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No emails match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages>1&&(
        <div className="p-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-500">Page {page} of {pages}</span>
          <div className="flex gap-1">
            <Link href={makePageUrl(page-1)} className={`p-1 rounded text-gray-400 hover:bg-gray-800 ${page<=1?"opacity-30 pointer-events-none":""}`}><ChevronLeft className="w-4 h-4"/></Link>
            <Link href={makePageUrl(page+1)} className={`p-1 rounded text-gray-400 hover:bg-gray-800 ${page>=pages?"opacity-30 pointer-events-none":""}`}><ChevronRight className="w-4 h-4"/></Link>
          </div>
        </div>
      )}
    </div>
  );
}
