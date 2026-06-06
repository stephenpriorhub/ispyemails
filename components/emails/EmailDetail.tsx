"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw, Check, Tag as TagIcon, Hash, Trash2 } from "lucide-react";
const pBadge: Record<string,string> = { PRIMARY:"bg-green-500/10 text-green-400 border-green-500/20", PROMOTIONS:"bg-amber-500/10 text-amber-400 border-amber-500/20", SPAM:"bg-red-500/10 text-red-400 border-red-500/20", UNKNOWN:"bg-gray-500/10 text-gray-400 border-gray-500/20" };
const EMAIL_TYPES = ["LIFT_NOTE","EDITORIAL","PROMO","UNKNOWN"] as const;
interface Props {
  email:{id:string;subject:string;fromName:string|null;fromEmail:string;receivedAt:Date|string;bodyHtml:string|null;bodyText:string|null;snippet:string|null;inboxPlacement:string;emailType:string;emailTypeConfirmed:boolean;publisherConfirmed:boolean;aiSummary:string|null;aiTicker:string|null;aiConfidence:number|null;publisher:{id:string;name:string}|null;topics:{topic:{id:string;name:string;isIgnored:boolean}}[];tags:{tag:{id:string;name:string;color:string}}[];offer:{url:string|null;promise:string|null;ticker:string|null}|null};
  publishers:{id:string;name:string}[];
  allTags:{id:string;name:string;color:string}[];
  isAdmin?: boolean;
}
export default function EmailDetail({ email, publishers, allTags, isAdmin = false }: Props) {
  const router = useRouter();
  const [selectedPublisherId,setSelectedPublisherId] = useState(email.publisher?.id??"");
  const [emailType,setEmailType] = useState(email.emailType);
  const [activeTagIds,setActiveTagIds] = useState(email.tags.map(t=>t.tag.id));
  const [saving,setSaving] = useState(false), [analyzing,setAnalyzing] = useState(false), [deleting,setDeleting] = useState(false), [view,setView] = useState<"html"|"text">("html");

  async function deleteEmail() {
    if (!confirm(`Delete this email?\n\n"${email.subject}"\n\nThis cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/emails/${email.id}`, { method: "DELETE" });
    router.push("/emails");
    router.refresh();
  }
  async function save() {
    setSaving(true);
    await fetch(`/api/emails/${email.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({publisherId:selectedPublisherId||null,publisherConfirmed:true,emailType,emailTypeConfirmed:true,tagIds:activeTagIds})});
    setSaving(false);
  }
  async function reanalyze() { setAnalyzing(true); await fetch(`/api/emails/${email.id}`,{method:"POST"}); setAnalyzing(false); window.location.reload(); }
  async function ignoreTopic(topicId:string) { await fetch(`/api/topics/${topicId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({isIgnored:true})}); window.location.reload(); }
  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <Link href="/emails" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mb-3"><ArrowLeft className="w-3.5 h-3.5"/>Back to emails</Link>
          <h1 className="text-lg font-semibold text-white leading-tight">{email.subject}</h1>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{email.fromName?`${email.fromName} <${email.fromEmail}>`:email.fromEmail}</span><span>·</span>
            <span>{new Date(email.receivedAt).toLocaleString()}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-medium ${pBadge[email.inboxPlacement]??pBadge.UNKNOWN}`}>{email.inboxPlacement}</span>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-gray-800 flex gap-2">
          <button onClick={()=>setView("html")} className={`text-xs px-2 py-1 rounded ${view==="html"?"bg-amber-500/10 text-amber-400":"text-gray-500 hover:text-gray-300"}`}>HTML</button>
          <button onClick={()=>setView("text")} className={`text-xs px-2 py-1 rounded ${view==="text"?"bg-amber-500/10 text-amber-400":"text-gray-500 hover:text-gray-300"}`}>Plain Text</button>
        </div>
        <div className="flex-1 overflow-auto">
          {view==="html"&&email.bodyHtml
            ? <iframe
                srcDoc={`<base target="_blank">${email.bodyHtml}`}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="w-full h-full border-none"
                title="Email body"
              />
            : <pre className="p-4 text-sm text-gray-300 whitespace-pre-wrap font-mono">{email.bodyText??email.snippet??"No content available"}</pre>}
        </div>
      </div>
      <div className="w-72 flex-shrink-0 overflow-y-auto bg-gray-900 space-y-4 p-4">
        {/* AI Summary — always visible */}
        {email.aiSummary&&<div className="bg-gray-800 rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">AI Summary</p><p className="text-xs text-gray-300 leading-relaxed">{email.aiSummary}</p></div>}
        {email.offer&&(email.offer.url||email.offer.promise)&&<div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3"><p className="text-xs text-amber-400 font-medium mb-2">Detected Offer</p>{email.offer.promise&&<p className="text-xs text-gray-300 leading-relaxed mb-2 italic">&quot;{email.offer.promise}&quot;</p>}{email.offer.ticker&&<p className="text-xs text-amber-400 mb-1">Ticker: ${email.offer.ticker}</p>}{email.offer.url&&<a href={email.offer.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline truncate"><ExternalLink className="w-3 h-3 flex-shrink-0"/><span className="truncate">{email.offer.url}</span></a>}</div>}

        {/* Publisher — read-only for non-admins */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Publisher</label>
          {isAdmin
            ? <select value={selectedPublisherId} onChange={e=>setSelectedPublisherId(e.target.value)} className="w-full py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500"><option value="">Unassigned</option>{publishers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
            : <p className="text-sm text-gray-300">{email.publisher?.name ?? <span className="text-gray-600">Unassigned</span>}</p>
          }
          {email.aiConfidence!=null&&!email.publisherConfirmed&&isAdmin&&<p className="text-xs text-gray-600 mt-1">AI guess · {Math.round(email.aiConfidence*100)}% confidence</p>}
        </div>

        {/* Email Type — admin editable, user read-only */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Email Type</label>
          {isAdmin
            ? <div className="grid grid-cols-2 gap-1">{EMAIL_TYPES.map(t=><button key={t} onClick={()=>setEmailType(t)} className={`text-xs py-1.5 px-2 rounded border transition-colors ${emailType===t?"bg-amber-500/10 border-amber-500/40 text-amber-400":"bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"}`}>{t.replace("_"," ")}</button>)}</div>
            : <p className="text-sm text-gray-300">{email.emailType.replace("_", " ")}</p>
          }
        </div>

        {/* Topics */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3"/>Topics</label>
          <div className="flex flex-wrap gap-1">
            {email.topics.map(({topic})=>(
              <div key={topic.id} className="flex items-center gap-1 bg-gray-800 px-2 py-0.5 rounded group">
                <span className="text-xs text-gray-300 capitalize">{topic.name}</span>
                {isAdmin&&<button onClick={()=>ignoreTopic(topic.id)} className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs ml-1">✕</button>}
              </div>
            ))}
            {email.topics.length===0&&<p className="text-xs text-gray-600">No topics detected</p>}
          </div>
        </div>

        {/* Tags — admin can add/remove */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5 flex items-center gap-1"><TagIcon className="w-3 h-3"/>Tags</label>
          <div className="flex flex-wrap gap-1">
            {isAdmin
              ? allTags.map(tag=>{const active=activeTagIds.includes(tag.id);return<button key={tag.id} onClick={()=>setActiveTagIds(active?activeTagIds.filter(id=>id!==tag.id):[...activeTagIds,tag.id])} className={`text-xs px-2 py-0.5 rounded border transition-colors ${active?"border-amber-500/40 text-amber-400 bg-amber-500/10":"border-gray-700 text-gray-500 bg-gray-800 hover:border-gray-600"}`}>{tag.name}</button>;})
              : activeTagIds.length > 0
                ? activeTagIds.map(tid=>{const tag=allTags.find(t=>t.id===tid);return tag?<span key={tid} className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">{tag.name}</span>:null;})
                : <p className="text-xs text-gray-600">No tags</p>
            }
          </div>
        </div>

        {/* Admin-only action buttons */}
        {isAdmin && (
          <div className="space-y-2 pt-2">
            <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded transition-colors"><Check className="w-3.5 h-3.5"/>{saving?"Saving…":"Save Changes"}</button>
            <button onClick={reanalyze} disabled={analyzing} className="w-full flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm rounded transition-colors"><RefreshCw className={`w-3.5 h-3.5 ${analyzing?"animate-spin":""}`}/>{analyzing?"Analyzing…":"Re-run AI Analysis"}</button>
            <button onClick={deleteEmail} disabled={deleting} className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 text-sm rounded border border-red-500/20 transition-colors"><Trash2 className="w-3.5 h-3.5"/>{deleting?"Deleting…":"Delete Email"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
