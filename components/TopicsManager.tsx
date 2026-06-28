"use client";

import { useState } from "react";
import { Hash, EyeOff, Eye, GitMerge, Trash2, X, Check } from "lucide-react";

interface Topic {
  id: string;
  name: string;
  isIgnored: boolean;
  color: string | null;
  synonyms: string[];
  _count: { emails: number };
}

export default function TopicsManager({ topics }: { topics: Topic[] }) {
  const [list, setList] = useState(topics);
  const [loading, setLoading] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  async function toggleIgnore(topic: Topic) {
    setLoading(topic.id);
    const res = await fetch(`/api/topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isIgnored: !topic.isIgnored }),
    });
    const updated = await res.json();
    setList(list.map((t) => (t.id === topic.id ? { ...t, isIgnored: updated.isIgnored } : t)));
    setLoading(null);
  }

  async function deleteTopic(id: string) {
    if (!confirm("Delete this topic? It will be removed from all emails.")) return;
    await fetch(`/api/topics/${id}`, { method: "DELETE" });
    setList(list.filter((t) => t.id !== id));
  }

  async function doMerge(sourceId: string) {
    if (!mergeTargetId) return;
    const source = list.find((t) => t.id === sourceId)!;
    const target = list.find((t) => t.id === mergeTargetId)!;
    if (!confirm(`Merge "${source.name}" into "${target.name}"?\n\nAll emails tagged "${source.name}" will get "${target.name}" instead. The AI will learn these are the same thing.`)) return;

    setLoading(sourceId);
    const res = await fetch("/api/topics/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId: mergeTargetId }),
    });
    const result = await res.json();

    // Update local state: remove source, add synonyms to target
    setList(
      list
        .filter((t) => t.id !== sourceId)
        .map((t) =>
          t.id === mergeTargetId
            ? { ...t, synonyms: [...t.synonyms, ...result.synonymsAdded] }
            : t
        )
    );
    setMerging(null);
    setMergeTargetId("");
    setLoading(null);
  }

  const active = list.filter((t) => !t.isIgnored);
  const ignored = list.filter((t) => t.isIgnored);

  function TopicRow({ topic }: { topic: Topic }) {
    return (
      <div key={topic.id}>
        {/* Normal row */}
        {merging !== topic.id && (
          <div className="flex items-center justify-between px-4 py-3 group">
            <div className="flex items-center gap-3 min-w-0">
              <Hash className="w-4 h-4 text-gray-600 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-sm text-white capitalize">{topic.name}</span>
                {topic.synonyms.length > 0 && (
                  <span className="text-xs text-gray-600 ml-2">
                    (was: {topic.synonyms.join(", ")})
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{topic._count.emails} emails</span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => { setMerging(topic.id); setMergeTargetId(""); }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                title="Merge into another topic"
              >
                <GitMerge className="w-3 h-3" /> Merge
              </button>
              <button
                onClick={() => toggleIgnore(topic)}
                disabled={loading === topic.id}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors"
              >
                <EyeOff className="w-3 h-3" /> Ignore
              </button>
              <button
                onClick={() => deleteTopic(topic.id)}
                className="p-1 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Merge row */}
        {merging === topic.id && (
          <div className="px-4 py-3 bg-blue-500/5 border-l-2 border-blue-500/40 space-y-2">
            <p className="text-xs text-blue-400 font-medium flex items-center gap-1">
              <GitMerge className="w-3.5 h-3.5" />
              Merge <strong className="capitalize">&quot;{topic.name}&quot;</strong> into:
            </p>
            <div className="flex gap-2">
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="flex-1 py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select target topic…</option>
                {list
                  .filter((t) => t.id !== topic.id && !t.isIgnored)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t._count.emails} emails)
                    </option>
                  ))}
              </select>
              <button
                onClick={() => doMerge(topic.id)}
                disabled={!mergeTargetId || loading === topic.id}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
              >
                <Check className="w-3 h-3" /> Merge
              </button>
              <button
                onClick={() => setMerging(null)}
                className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              All emails tagged &quot;{topic.name}&quot; will be re-tagged to the target. The AI will learn these are the same and never create &quot;{topic.name}&quot; again.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Hash className="w-6 h-6 text-amber-400" />
          Topics
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Merge duplicates to teach the AI, ignore topics to suppress them, or delete to remove entirely.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Active ({active.length})</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {active.map((topic) => <TopicRow key={topic.id} topic={topic} />)}
            {active.length === 0 && (
              <p className="px-4 py-6 text-gray-500 text-sm text-center">No active topics yet</p>
            )}
          </div>
        </div>

        {ignored.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Ignored ({ignored.length})</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              {ignored.map((topic) => (
                <div key={topic.id} className="flex items-center justify-between px-4 py-3 opacity-50">
                  <div className="flex items-center gap-3">
                    <Hash className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-400 capitalize line-through">{topic.name}</span>
                    <span className="text-xs text-gray-600">{topic._count.emails} emails</span>
                  </div>
                  <button
                    onClick={() => toggleIgnore(topic)}
                    disabled={loading === topic.id}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-400 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
