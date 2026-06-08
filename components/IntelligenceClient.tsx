"use client";
import { useState } from "react";
import { Brain, CheckCircle, XCircle, Bot, UserCog, AlertTriangle, Send, CheckCheck } from "lucide-react";
import Link from "next/link";

interface Learning {
  id: string; content: string; source: string; category: string;
  status: string; createdAt: string | Date; isContradicted: boolean;
  contradictionNote?: string | null;
  email?: { id: string; subject: string } | null;
  guru?: { id: string; name: string } | null;
  publisher?: { id: string; name: string } | null;
  list?: { id: string; name: string } | null;
}

const catColor: Record<string, string> = {
  GURU: "text-purple-400 bg-purple-400/10",
  PUBLISHER: "text-amber-400 bg-amber-400/10",
  LIST: "text-blue-400 bg-blue-400/10",
  TOPIC: "text-green-400 bg-green-400/10",
  GENERAL: "text-gray-400 bg-gray-700/50",
};

function SourceBadge({ source }: { source: string }) {
  if (source === "AI_EMAIL") {
    return (
      <div className="flex items-center gap-1 text-blue-400 flex-shrink-0" title="Detected by AI from email">
        <Bot className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">AI</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-amber-400 flex-shrink-0" title="From your action">
      <UserCog className="w-3.5 h-3.5" />
      <span className="text-[10px] font-medium uppercase tracking-wide">You</span>
    </div>
  );
}

function LearningCard({ learning, onValidate, onIgnore }: {
  learning: Learning;
  onValidate?: () => void;
  onIgnore?: () => void;
}) {
  const entity = learning.guru?.name || learning.publisher?.name || learning.list?.name;
  return (
    <div className={`flex items-start gap-3 px-4 py-3 group ${learning.isContradicted ? "bg-amber-500/5" : ""}`}>
      <SourceBadge source={learning.source} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug">{learning.content}</p>
        {learning.isContradicted && (
          <div className="flex items-start gap-1.5 mt-1.5 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-300 leading-snug">
              <span className="font-semibold">Contradicts validated knowledge</span>
              {learning.contradictionNote ? ` — ${learning.contradictionNote}` : ""}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${catColor[learning.category] ?? catColor.GENERAL}`}>
            {learning.category}
          </span>
          {entity && <span className="text-xs text-gray-600">· {entity}</span>}
          {learning.source === "AI_EMAIL" && learning.email && (
            <Link href={`/emails/${learning.email.id}`} className="text-xs text-gray-600 hover:text-gray-400 truncate max-w-48">
              · {learning.email.subject.substring(0, 45)}…
            </Link>
          )}
          <span className="text-xs text-gray-700">{new Date(learning.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      {onValidate && onIgnore && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
          <button onClick={onValidate} className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-400/10 rounded transition-colors" title="Validate">
            <CheckCircle className="w-3.5 h-3.5" />
          </button>
          <button onClick={onIgnore} className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Ignore">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}


export default function IntelligenceClient({ pending: initialPending, validated: initialValidated }: {
  pending: Learning[];
  validated: Learning[];
}) {
  const [pending, setPending] = useState(initialPending);
  const [validated, setValidated] = useState(initialValidated);
  const [tab, setTab] = useState<"pending" | "validated" | "export">("pending");
  const [showValidated, setShowValidated] = useState(true);
  const [exportBlocks, setExportBlocks] = useState<{ title: string; entity: string; entityType: string; learningIds: string[]; appended: boolean; markdown: string }[] | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; message?: string; written?: string[] } | null>(null);

  const contradictions = pending.filter(l => l.isContradicted);

  async function validate(id: string) {
    await fetch(`/api/learnings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VALIDATED" }) });
    const item = pending.find(l => l.id === id)!;
    setPending(p => p.filter(l => l.id !== id));
    setValidated(v => [{ ...item, status: "VALIDATED" }, ...v]);
  }

  async function ignore(id: string) {
    await fetch(`/api/learnings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IGNORED" }) });
    setPending(p => p.filter(l => l.id !== id));
  }

  async function validateAll() {
    await Promise.all(pending.map(l => fetch(`/api/learnings/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VALIDATED" }) })));
    setValidated(v => [...pending.map(l => ({ ...l, status: "VALIDATED" })), ...v]);
    setPending([]);
  }

  async function loadExport() {
    setLoadingExport(true);
    const res = await fetch("/api/learnings/export");
    const data = await res.json();
    setExportBlocks(data.blocks);
    setLoadingExport(false);
  }

  async function pushToBrain() {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch("/api/learnings/export", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPushResult({ ok: true, written: data.written });
        // Reload blocks to show updated appended status
        await loadExport();
      } else {
        setPushResult({ ok: false, message: data.error ?? "Push failed" });
      }
    } catch (err) {
      setPushResult({ ok: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Brain className="w-6 h-6 text-amber-400" />Intelligence
        </h1>
        <p className="text-gray-400 text-sm mt-1 flex items-center gap-4">
          What iSpyFinpub is learning from competitor emails.
          <span className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-blue-400"><Bot className="w-3 h-3" />AI detected</span>
            <span className="flex items-center gap-1 text-amber-400"><UserCog className="w-3 h-3" />Your action</span>
            <span className="flex items-center gap-1 text-amber-400"><AlertTriangle className="w-3 h-3" />Contradicts validated knowledge (shown inline)</span>
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {[
          { key: "pending", label: `Pending Review${pending.length > 0 ? ` (${pending.length})` : ""}`, alert: contradictions.length > 0 },
          { key: "validated", label: `Validated Knowledge (${validated.length})` },
          { key: "export", label: "Export to Brain" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as typeof tab); if (t.key === "export" && !exportBlocks) loadExport(); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.key ? "border-amber-400 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
            {t.alert && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {tab === "pending" && (
        <div>
          {contradictions.length > 0 && (
            <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300">
                <strong>{contradictions.length}</strong> pending {contradictions.length === 1 ? "item" : "items"} may contradict existing validated knowledge. Review carefully before validating.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">{pending.length} items awaiting review</span>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const res = await fetch("/api/learnings", { method: "DELETE" });
                  const data = await res.json();
                  if (data.removed > 0) {
                    // Reload page to refresh the list
                    window.location.reload();
                  }
                }}
                className="text-xs text-gray-500 hover:text-amber-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                title="Remove pending items already covered by validated knowledge"
              >
                Clean duplicates
              </button>
              {pending.length > 0 && (
                <button onClick={validateAll} className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-400/10 transition-colors">
                  Validate all
                </button>
              )}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {pending.map(l => (
              <LearningCard key={l.id} learning={l} onValidate={() => validate(l.id)} onIgnore={() => ignore(l.id)} />
            ))}
            {pending.length === 0 && (
              <p className="px-4 py-8 text-center text-gray-500 text-sm">No pending intelligence. Run a sync or use Settings → Extract Intelligence to find new insights.</p>
            )}
          </div>
        </div>
      )}

      {/* Validated Knowledge tab */}
      {tab === "validated" && (
        <div>
          <p className="text-xs text-gray-500 mb-4">
            These facts are confirmed and fed into the AI on every email analysis. The more you validate, the smarter the system gets.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {validated.map(l => <LearningCard key={l.id} learning={l} />)}
            {validated.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500 text-sm">No validated knowledge yet. Validate pending items to build the knowledge base.</p>
            )}
          </div>
        </div>
      )}

      {/* Export to Brain tab */}
      {tab === "export" && (
        <div>
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs text-gray-500 max-w-lg">
              Pushes all validated intelligence directly to the brain vault markdown files.
              Existing entries are updated in place — nothing gets duplicated.
              Git commits automatically after writing.
            </p>
            <button
              onClick={pushToBrain}
              disabled={pushing || exportBlocks?.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded-lg transition-colors flex-shrink-0 ml-4"
            >
              <Send className={`w-3.5 h-3.5 ${pushing ? "animate-pulse" : ""}`} />
              {pushing ? "Pushing…" : "Push All to Brain"}
            </button>
          </div>

          {pushResult && (
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-start gap-2 ${pushResult.ok ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
              {pushResult.ok
                ? <><CheckCheck className="w-4 h-4 flex-shrink-0 mt-0.5" /><div>Pushed to brain vault and committed. Files: <code className="text-xs">{(pushResult.written ?? []).join(", ")}</code></div></>
                : <><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{pushResult.message}</>}
            </div>
          )}

          {loadingExport && <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>}
          {exportBlocks?.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">No validated learnings to push yet.</p>}

          {exportBlocks && exportBlocks.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              {exportBlocks.map((block, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-sm text-white">{block.title}</span>
                    <span className="text-xs text-gray-600 ml-2">→ <code>{block.entity}.md</code></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{block.learningIds.length} insight{block.learningIds.length !== 1 ? "s" : ""}</span>
                    {block.appended
                      ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCheck className="w-3 h-3" />Synced</span>
                      : <span className="text-xs text-amber-400">Pending push</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
