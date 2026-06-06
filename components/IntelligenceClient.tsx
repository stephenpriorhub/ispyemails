"use client";
import { useState } from "react";
import { Brain, CheckCircle, XCircle, Bot, User, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

interface Learning {
  id: string; content: string; source: string; category: string; status: string; createdAt: string | Date;
  email?: { id: string; subject: string } | null;
  guru?: { id: string; name: string } | null;
  publisher?: { id: string; name: string } | null;
  list?: { id: string; name: string } | null;
}

const catColor: Record<string, string> = {
  GURU: "text-purple-400", PUBLISHER: "text-amber-400", LIST: "text-blue-400", TOPIC: "text-green-400", GENERAL: "text-gray-400",
};
const catLabel: Record<string, string> = {
  GURU: "Guru", PUBLISHER: "Publisher", LIST: "List", TOPIC: "Topic", GENERAL: "General",
};

function LearningCard({ learning, onValidate, onIgnore }: { learning: Learning; onValidate?: () => void; onIgnore?: () => void }) {
  const isAI = learning.source === "AI_EMAIL";
  const entity = learning.guru?.name || learning.publisher?.name || learning.list?.name;
  return (
    <div className="flex items-start gap-3 px-4 py-3 group">
      <div className="flex-shrink-0 mt-0.5" title={isAI ? "Detected by AI from email" : "From user action"}>
        {isAI ? <Bot className="w-4 h-4 text-blue-400" /> : <User className="w-4 h-4 text-amber-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug">{learning.content}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs font-medium ${catColor[learning.category] ?? "text-gray-400"}`}>{catLabel[learning.category]}</span>
          {entity && <span className="text-xs text-gray-600">· {entity}</span>}
          {isAI && learning.email && (
            <Link href={`/emails/${learning.email.id}`} className="text-xs text-gray-600 hover:text-gray-400 truncate max-w-48">
              · {learning.email.subject.substring(0, 50)}
            </Link>
          )}
          <span className="text-xs text-gray-700">{new Date(learning.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      {onValidate && onIgnore && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={onValidate} className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-400/10 rounded transition-colors" title="Validate — add to brain">
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

export default function IntelligenceClient({ pending: initialPending, validated: initialValidated }: { pending: Learning[]; validated: Learning[] }) {
  const [pending, setPending] = useState(initialPending);
  const [validated, setValidated] = useState(initialValidated);
  const [showValidated, setShowValidated] = useState(false);

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

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Brain className="w-6 h-6 text-amber-400" />Intelligence
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          What the AI is learning from emails and user actions.
          <span className="ml-2 text-xs"><Bot className="w-3 h-3 inline mr-1 text-blue-400" />= from email &nbsp;<User className="w-3 h-3 inline mr-1 text-amber-400" />= from your actions</span>
        </p>
      </div>

      {/* Pending — needs review */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            Pending Review
            {pending.length > 0 && <span className="px-1.5 py-0.5 text-xs bg-amber-500/10 text-amber-400 rounded-full">{pending.length}</span>}
          </h2>
          {pending.length > 0 && (
            <button
              onClick={async () => {
                await Promise.all(pending.map(l => fetch(`/api/learnings/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VALIDATED" }) })));
                setValidated(v => [...pending.map(l => ({ ...l, status: "VALIDATED" })), ...v]);
                setPending([]);
              }}
              className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-400/10 transition-colors"
            >
              Validate all
            </button>
          )}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {pending.map(l => (
            <LearningCard key={l.id} learning={l} onValidate={() => validate(l.id)} onIgnore={() => ignore(l.id)} />
          ))}
          {pending.length === 0 && (
            <p className="px-4 py-8 text-center text-gray-500 text-sm">No pending learnings. Run a sync to detect new insights from emails.</p>
          )}
        </div>
      </div>

      {/* Validated knowledge base */}
      <div>
        <button
          onClick={() => setShowValidated(!showValidated)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white mb-3 transition-colors"
        >
          {showValidated ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Validated — Fed Into AI Brain ({validated.length})
        </button>
        {showValidated && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {validated.map(l => <LearningCard key={l.id} learning={l} />)}
            {validated.length === 0 && <p className="px-4 py-6 text-center text-gray-500 text-sm">No validated learnings yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
