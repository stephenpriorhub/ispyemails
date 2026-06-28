"use client";

import { useState } from "react";
import { Tag, Plus, Trash2, GitMerge, X, Check } from "lucide-react";

const COLORS = ["#F59E0B","#EF4444","#10B981","#3B82F6","#8B5CF6","#EC4899","#06B6D4","#84CC16","#F97316","#6B7280"];

interface TagItem { id: string; name: string; color: string; _count: { emails: number } }

export default function TagsManager({ tags }: { tags: TagItem[] }) {
  const [list, setList] = useState(tags);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const tag = await (await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })).json();
    setList([...list, { ...tag, _count: { emails: 0 } }]);
    setNewName("");
    setCreating(false);
  }

  async function deleteTag(id: string) {
    if (!confirm("Delete this tag?")) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    setList(list.filter((t) => t.id !== id));
  }

  async function doMerge(sourceId: string) {
    if (!mergeTargetId) return;
    const source = list.find((t) => t.id === sourceId)!;
    const target = list.find((t) => t.id === mergeTargetId)!;
    if (!confirm(`Merge tag "${source.name}" into "${target.name}"?\n\nAll emails tagged "${source.name}" will get "${target.name}" instead.`)) return;

    setLoading(sourceId);
    await fetch("/api/tags/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId: mergeTargetId }),
    });
    setList(list.filter((t) => t.id !== sourceId));
    setMerging(null);
    setMergeTargetId("");
    setLoading(null);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Tag className="w-6 h-6 text-amber-400" />
          Tags
        </h1>
        <p className="text-gray-400 text-sm mt-1">Create custom tags, merge duplicates, or delete unused ones.</p>
      </div>

      {/* Create form */}
      <form onSubmit={createTag} className="mb-6 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Create New Tag</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Tag name…"
            className="flex-1 py-1.5 px-3 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? "scale-125 ring-2 ring-white" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button type="submit" disabled={creating || !newName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded transition-colors">
            <Plus className="w-3.5 h-3.5" /> Create
          </button>
        </div>
      </form>

      {/* Tag list */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        {list.map((tag) => (
          <div key={tag.id}>
            {/* Normal row */}
            {merging !== tag.id && (
              <div className="flex items-center justify-between px-4 py-3 group">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm text-white">{tag.name}</span>
                  <span className="text-xs text-gray-500">{tag._count.emails} emails</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setMerging(tag.id); setMergeTargetId(""); }}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                    title="Merge into another tag"
                  >
                    <GitMerge className="w-3 h-3" /> Merge
                  </button>
                  <button onClick={() => deleteTag(tag.id)}
                    className="p-1 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Merge row */}
            {merging === tag.id && (
              <div className="px-4 py-3 bg-blue-500/5 border-l-2 border-blue-500/40 space-y-2">
                <p className="text-xs text-blue-400 font-medium flex items-center gap-1">
                  <GitMerge className="w-3.5 h-3.5" />
                  Merge <strong>&quot;{tag.name}&quot;</strong> into:
                </p>
                <div className="flex gap-2">
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="flex-1 py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select target tag…</option>
                    {list.filter((t) => t.id !== tag.id).map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t._count.emails} emails)</option>
                    ))}
                  </select>
                  <button onClick={() => doMerge(tag.id)} disabled={!mergeTargetId || loading === tag.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors">
                    <Check className="w-3 h-3" /> Merge
                  </button>
                  <button onClick={() => setMerging(null)}
                    className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-gray-500">All emails tagged &quot;{tag.name}&quot; will be re-tagged to the target. &quot;{tag.name}&quot; will be deleted.</p>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <p className="px-4 py-8 text-center text-gray-500 text-sm">No tags yet. Create one above.</p>
        )}
      </div>
    </div>
  );
}
