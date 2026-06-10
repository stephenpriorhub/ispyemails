"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw, Check, Tag as TagIcon, Hash, Trash2, BookOpen } from "lucide-react";
const pBadge: Record<string,string> = { PRIMARY:"bg-green-500/10 text-green-400 border-green-500/20", PROMOTIONS:"bg-amber-500/10 text-amber-400 border-amber-500/20", SPAM:"bg-red-500/10 text-red-400 border-red-500/20", UNKNOWN:"bg-gray-500/10 text-gray-400 border-gray-500/20" };
const EMAIL_TYPES = ["LIFT_NOTE","EDITORIAL","PROMO"] as const;

// ─── Deep Analysis types ──────────────────────────────────────────────────────
interface DeepAnalysis {
  id: string;
  analysisType: string;
  complianceRisk: string;
  mtaOverlap: string;
  notableFor: string | null;
  modelUsed: string;
  createdAt: Date | string;
  rawJson: Record<string, unknown>;
}

// ─── Analysis Panel ───────────────────────────────────────────────────────────
type AnalysisTab = "offer" | "marketing" | "compliance" | "trade";

function riskBadge(level: string) {
  if (level === "HIGH") return "bg-red-500/15 text-red-400 border-red-500/30";
  if (level === "MEDIUM") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-slate-700/40 text-slate-400 border-slate-600/30";
}

function AnalysisPanel({ analysis }: { analysis: DeepAnalysis }) {
  const [tab, setTab] = useState<AnalysisTab>("offer");
  const raw = analysis.rawJson as {
    trade_recommendation?: { present?: boolean; ticker?: string|null; direction?: string|null; instrument?: string|null; strike?: string|null; expiry?: string|null; thesis_summary?: string|null };
    offer?: { product_name?: string|null; price_point?: string|null; original_price?: string|null; discount_framing?: string|null; guarantee?: string|null; urgency_type?: string; urgency_copy?: string|null; free_bonus_items?: string[]; call_to_action?: string|null; landing_page_url?: string|null };
    marketing_tactics?: { lead_type?: string|null; hook_summary?: string|null; hook_quote?: string|null; narrative_frame?: string|null; credibility_signals?: string[]; lift_note_promoter?: string|null; lift_note_subject?: string|null };
    compliance_signals?: { return_claims?: string[]; win_rate_claims?: string[]; testimonials_with_figures?: string[]; guarantee_language?: string|null; risk_disclosure_present?: boolean; compliance_risk_level?: string; compliance_notes?: string|null };
    editorial_intel?: { market_thesis?: string|null; featured_tickers?: string[]; sector_focus?: string|null; timeframe?: string; contrarian_or_consensus?: string; key_argument?: string|null };
  };

  const tradePresent = raw.trade_recommendation?.present === true;
  const tabs: { id: AnalysisTab; label: string }[] = [
    { id: "offer", label: "Offer" },
    { id: "marketing", label: "Marketing" },
    { id: "compliance", label: "Compliance" },
    ...(tradePresent ? [{ id: "trade" as AnalysisTab, label: "Trade Idea" }] : []),
  ];

  return (
    <div className="border-t border-gray-800 mt-4 pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Deep Analysis</p>
        <span className={`text-xs px-1.5 py-0.5 rounded border ${riskBadge(analysis.complianceRisk)}`}>{analysis.complianceRisk} risk</span>
      </div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-3 border-b border-gray-800 pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`text-xs px-2 py-1 rounded transition-colors ${tab===t.id ? "bg-gray-700 text-gray-200" : "text-gray-500 hover:text-gray-300"}`}>{t.label}</button>
        ))}
      </div>

      {/* Offer tab */}
      {tab === "offer" && (
        <div className="space-y-2 text-xs">
          {raw.offer?.product_name && <Row label="Product" value={raw.offer.product_name} />}
          {raw.offer?.price_point && <Row label="Price" value={raw.offer.price_point} />}
          {raw.offer?.original_price && <Row label="Original price" value={raw.offer.original_price} />}
          {raw.offer?.discount_framing && <Row label="Discount" value={raw.offer.discount_framing} />}
          {raw.offer?.urgency_type && raw.offer.urgency_type !== "none" && <Row label="Urgency" value={raw.offer.urgency_type} />}
          {raw.offer?.urgency_copy && <div className="bg-gray-800 rounded p-2"><p className="text-gray-500 mb-0.5">Urgency copy</p><p className="text-gray-300 italic">&ldquo;{raw.offer.urgency_copy}&rdquo;</p></div>}
          {raw.offer?.call_to_action && <Row label="CTA" value={raw.offer.call_to_action} />}
          {raw.offer?.guarantee && <Row label="Guarantee" value={raw.offer.guarantee} />}
          {raw.offer?.free_bonus_items && raw.offer.free_bonus_items.length > 0 && (
            <div><p className="text-gray-500 mb-1">Free bonuses</p><ul className="space-y-0.5">{raw.offer.free_bonus_items.map((b,i)=><li key={i} className="text-gray-300 pl-2 border-l border-gray-700">{b}</li>)}</ul></div>
          )}
          {raw.offer?.landing_page_url && <a href={raw.offer.landing_page_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:underline truncate"><ExternalLink className="w-3 h-3 flex-shrink-0" /><span className="truncate">{raw.offer.landing_page_url}</span></a>}
          {!raw.offer?.product_name && !raw.offer?.price_point && <p className="text-gray-600">No offer data extracted.</p>}
        </div>
      )}

      {/* Marketing tab */}
      {tab === "marketing" && (
        <div className="space-y-2 text-xs">
          {raw.marketing_tactics?.lead_type && <Row label="Lead type" value={raw.marketing_tactics.lead_type} />}
          {raw.marketing_tactics?.narrative_frame && <Row label="Narrative" value={raw.marketing_tactics.narrative_frame} />}
          {raw.marketing_tactics?.hook_summary && <Row label="Hook" value={raw.marketing_tactics.hook_summary} />}
          {raw.marketing_tactics?.hook_quote && <div className="bg-gray-800 rounded p-2"><p className="text-gray-500 mb-0.5">Hook quote</p><p className="text-gray-300 italic">&ldquo;{raw.marketing_tactics.hook_quote}&rdquo;</p></div>}
          {raw.marketing_tactics?.lift_note_promoter && <Row label="Promoter" value={raw.marketing_tactics.lift_note_promoter} />}
          {raw.marketing_tactics?.lift_note_subject && <Row label="Subject promoted" value={raw.marketing_tactics.lift_note_subject} />}
          {raw.marketing_tactics?.credibility_signals && raw.marketing_tactics.credibility_signals.length > 0 && (
            <div><p className="text-gray-500 mb-1">Credibility signals</p><ul className="space-y-0.5">{raw.marketing_tactics.credibility_signals.map((s,i)=><li key={i} className="text-gray-300 pl-2 border-l border-gray-700">{s}</li>)}</ul></div>
          )}
        </div>
      )}

      {/* Compliance tab */}
      {tab === "compliance" && (
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded border font-medium ${riskBadge(raw.compliance_signals?.compliance_risk_level ?? "NONE")}`}>{raw.compliance_signals?.compliance_risk_level ?? "NONE"}</span>
            <span className="text-gray-500">{raw.compliance_signals?.risk_disclosure_present ? "Risk disclosure present" : "No risk disclosure"}</span>
          </div>
          {raw.compliance_signals?.compliance_notes && <p className="text-gray-400">{raw.compliance_signals.compliance_notes}</p>}
          {raw.compliance_signals?.return_claims && raw.compliance_signals.return_claims.length > 0 && (
            <div><p className="text-gray-500 mb-1">Return claims</p><ul className="space-y-1">{raw.compliance_signals.return_claims.map((c,i)=><li key={i} className="text-red-300/80 pl-2 border-l border-red-500/30 italic">&ldquo;{c}&rdquo;</li>)}</ul></div>
          )}
          {raw.compliance_signals?.win_rate_claims && raw.compliance_signals.win_rate_claims.length > 0 && (
            <div><p className="text-gray-500 mb-1">Win rate claims</p><ul className="space-y-1">{raw.compliance_signals.win_rate_claims.map((c,i)=><li key={i} className="text-amber-300/80 pl-2 border-l border-amber-500/30 italic">&ldquo;{c}&rdquo;</li>)}</ul></div>
          )}
          {raw.compliance_signals?.testimonials_with_figures && raw.compliance_signals.testimonials_with_figures.length > 0 && (
            <div><p className="text-gray-500 mb-1">Testimonials with figures</p><ul className="space-y-1">{raw.compliance_signals.testimonials_with_figures.map((c,i)=><li key={i} className="text-gray-300 pl-2 border-l border-gray-600 italic">&ldquo;{c}&rdquo;</li>)}</ul></div>
          )}
          {raw.compliance_signals?.guarantee_language && <Row label="Guarantee language" value={raw.compliance_signals.guarantee_language} />}
        </div>
      )}

      {/* Trade Idea tab — only shown when present */}
      {tab === "trade" && tradePresent && (
        <div className="space-y-2 text-xs">
          {raw.trade_recommendation?.ticker && <Row label="Ticker" value={`$${raw.trade_recommendation.ticker}`} />}
          {raw.trade_recommendation?.direction && <Row label="Direction" value={raw.trade_recommendation.direction} />}
          {raw.trade_recommendation?.instrument && <Row label="Instrument" value={raw.trade_recommendation.instrument} />}
          {raw.trade_recommendation?.strike && <Row label="Strike" value={raw.trade_recommendation.strike} />}
          {raw.trade_recommendation?.expiry && <Row label="Expiry" value={raw.trade_recommendation.expiry} />}
          {raw.trade_recommendation?.thesis_summary && <div className="bg-gray-800 rounded p-2"><p className="text-gray-500 mb-0.5">Thesis</p><p className="text-gray-300">{raw.trade_recommendation.thesis_summary}</p></div>}
        </div>
      )}

      <p className="text-gray-700 text-xs mt-3">{analysis.modelUsed} · {new Date(analysis.createdAt).toLocaleDateString()}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 flex-shrink-0 w-28">{label}</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

interface Props {
  email:{id:string;subject:string;fromName:string|null;fromEmail:string;receivedAt:Date|string;bodyHtml:string|null;bodyText:string|null;snippet:string|null;inboxPlacement:string;emailType:string;emailTypeConfirmed:boolean;publisherConfirmed:boolean;aiSummary:string|null;aiTicker:string|null;aiConfidence:number|null;publisher:{id:string;name:string}|null;list:{id:string;name:string}|null;topics:{topic:{id:string;name:string;isIgnored:boolean}}[];tags:{tag:{id:string;name:string;color:string}}[];offer:{url:string|null;promise:string|null;ticker:string|null}|null;deepAnalysis:{id:string;analysisType:string;complianceRisk:string;mtaOverlap:string;notableFor:string|null;modelUsed:string;createdAt:Date|string;rawJson:unknown}|null};
  publishers:{id:string;name:string}[];
  allTags:{id:string;name:string;color:string}[];
  allLists?:{id:string;name:string}[];
  allTopics?:{id:string;name:string}[];
  isAdmin?: boolean;
}
export default function EmailDetail({ email, publishers, allTags, allLists=[], allTopics=[], isAdmin = false }: Props) {
  const router = useRouter();
  const deepAnalysis = email.deepAnalysis ? { ...email.deepAnalysis, rawJson: email.deepAnalysis.rawJson as Record<string, unknown> } : null;
  const [selectedPublisherId,setSelectedPublisherId] = useState(email.publisher?.id??"");
  const [selectedListId,setSelectedListId] = useState(email.list?.id??"");
  const [emailType,setEmailType] = useState(email.emailType);
  const [activeTagIds,setActiveTagIds] = useState(email.tags.map(t=>t.tag.id));
  const [activeTopicIds,setActiveTopicIds] = useState(email.topics.map(t=>t.topic.id));
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
    await fetch(`/api/emails/${email.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({publisherId:selectedPublisherId||null,publisherConfirmed:true,listId:selectedListId||null,listConfirmed:selectedListId?true:false,emailType,emailTypeConfirmed:true,tagIds:activeTagIds,topicIds:activeTopicIds})});
    setSaving(false);
    router.refresh();
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

        {/* Deep Analysis Panel */}
        {/* Deep Analysis panel — only shown if available in a future schema migration */}

        {/* Publisher — read-only for non-admins */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Publisher</label>
          {isAdmin
            ? <select value={selectedPublisherId} onChange={e=>setSelectedPublisherId(e.target.value)} className="w-full py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500"><option value="">Unassigned</option>{publishers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
            : <p className="text-sm text-gray-300">{email.publisher?.name ?? <span className="text-gray-600">Unassigned</span>}</p>
          }
          {email.aiConfidence!=null&&!email.publisherConfirmed&&isAdmin&&<p className="text-xs text-gray-600 mt-1">AI guess · {Math.round(email.aiConfidence*100)}% confidence</p>}
        </div>

        {/* List — admin can assign inline */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5 flex items-center gap-1"><BookOpen className="w-3 h-3"/>List</label>
          {isAdmin
            ? <select value={selectedListId} onChange={e=>setSelectedListId(e.target.value)} className={`w-full py-1.5 px-2 bg-gray-800 border rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500 ${!selectedListId?"border-amber-500/40":"border-gray-700"}`}><option value="">Unassigned</option>{allLists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
            : <p className="text-sm text-gray-300">{email.list?.name ?? <span className="text-gray-600">Unassigned</span>}</p>
          }
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
          {isAdmin ? (
            <div className="flex flex-wrap gap-1">
              {allTopics.map(topic=>{
                const active=activeTopicIds.includes(topic.id);
                return <button key={topic.id} onClick={()=>setActiveTopicIds(active?activeTopicIds.filter(id=>id!==topic.id):[...activeTopicIds,topic.id])} className={`text-xs px-2 py-0.5 rounded border capitalize transition-colors ${active?"bg-gray-700 border-gray-500 text-gray-200":"border-gray-700 text-gray-600 bg-gray-800 hover:border-gray-600 hover:text-gray-400"}`}>{topic.name}</button>;
              })}
              {allTopics.length===0&&<p className="text-xs text-gray-600">No topics in system</p>}
              {activeTopicIds.length===0&&<p className="text-xs text-amber-400/70 mt-1 w-full">⚠ No topics selected</p>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {email.topics.map(({topic})=>(
                <div key={topic.id} className="flex items-center gap-1 bg-gray-800 px-2 py-0.5 rounded group">
                  <span className="text-xs text-gray-300 capitalize">{topic.name}</span>
                </div>
              ))}
              {email.topics.length===0&&<p className="text-xs text-gray-600">No topics detected</p>}
            </div>
          )}
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
