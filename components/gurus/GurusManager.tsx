"use client";
import { useState } from "react";
import { User, GitMerge, Pencil, Trash2, EyeOff, Eye, X, Check, Plus } from "lucide-react";

interface ListRef { id: string; name: string; publisher: { name: string } | null }
interface GuruItem {
  id: string; name: string; bio: string | null; notes: string | null; isIgnored: boolean;
  lists: { listId: string; guruId: string; isPrimary: boolean; list: ListRef }[];
  _count: { emails: number };
}

export default function GurusManager({ gurus: initial, lists }: { gurus: GuruItem[]; lists: { id: string; name: string }[] }) {
  const [gurus, setGurus] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [editForm, setEditForm] = useState({ name: "", bio: "", notes: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [sortByList, setSortByList] = useState<string>("all");

  async function addGuru(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    const res = await fetch("/api/gurus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: addName.trim() }) });
    const g = await res.json();
    setGurus([...gurus, { ...g, lists: [], _count: { emails: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setAddName(""); setShowAdd(false);
  }

  async function saveEdit(id: string) {
    setLoading(id);
    await fetch(`/api/gurus/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editForm.name, bio: editForm.bio || null, notes: editForm.notes || null }) });
    setGurus(gurus.map(g => g.id === id ? { ...g, name: editForm.name, bio: editForm.bio || null, notes: editForm.notes || null } : g));
    setEditing(null); setLoading(null);
  }

  async function toggleIgnore(guru: GuruItem) {
    setLoading(guru.id);
    const res = await fetch(`/api/gurus/${guru.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isIgnored: !guru.isIgnored }) });
    const u = await res.json();
    setGurus(gurus.map(g => g.id === guru.id ? { ...g, isIgnored: u.isIgnored } : g));
    setLoading(null);
  }

  async function doMerge(sourceId: string) {
    if (!mergeTarget) return;
    const source = gurus.find(g => g.id === sourceId)!;
    const target = gurus.find(g => g.id === mergeTarget)!;
    if (!confirm(`Merge "${source.name}" into "${target.name}"? All emails and list associations will move to the target.`)) return;
    setLoading(sourceId);
    await fetch("/api/gurus/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, targetId: mergeTarget }) });
    setGurus(gurus.filter(g => g.id !== sourceId));
    setMerging(null); setMergeTarget(""); setLoading(null);
  }

  async function deleteGuru(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/gurus/${id}`, { method: "DELETE" });
    setGurus(gurus.filter(g => g.id !== id));
  }

  const active = gurus.filter(g => !g.isIgnored);
  const ignored = gurus.filter(g => g.isIgnored);

  const filteredActive = sortByList === "all"
    ? active
    : active.filter(g => g.lists.some(l => l.list.id === sortByList));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><User className="w-6 h-6 text-amber-400" />Gurus</h1>
          <p className="text-gray-400 text-sm mt-1">Editors, analysts, and voices in the emails</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" />Add Guru
        </button>
      </div>

      {/* Sort by list */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Filter by list:</span>
        <select value={sortByList} onChange={e => setSortByList(e.target.value)} className="py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
          <option value="all">All lists</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {showAdd && (
        <form onSubmit={addGuru} className="flex gap-3 mb-4 bg-gray-900 border border-amber-500/30 rounded-lg p-3">
          <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Guru name…" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
          <button type="submit" className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded">Cancel</button>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        {filteredActive.map(guru => (
          <div key={guru.id}>
            {editing !== guru.id && merging !== guru.id && (
              <div className="flex items-start gap-4 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{guru.name}</span>
                    <span className="text-xs text-gray-500">{guru._count.emails} emails</span>
                  </div>
                  {guru.lists.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {guru.lists.map(({ list, isPrimary }) => (
                        <span key={list.id} className={`text-xs px-1.5 py-0.5 rounded ${isPrimary ? "bg-amber-500/10 text-amber-400" : "bg-gray-700 text-gray-400"}`}>
                          {list.name}{list.publisher ? ` (${list.publisher.name})` : ""}
                          {isPrimary && " ★"}
                        </span>
                      ))}
                    </div>
                  )}
                  {guru.bio && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{guru.bio}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => { setEditing(guru.id); setEditForm({ name: guru.name, bio: guru.bio ?? "", notes: guru.notes ?? "" }); }} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setMerging(guru.id); setMergeTarget(""); }} className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"><GitMerge className="w-3.5 h-3.5" /></button>
                  <button onClick={() => toggleIgnore(guru)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded" title="Ignore — removes from all views"><EyeOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteGuru(guru.id, guru.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}

            {editing === guru.id && (
              <div className="px-4 py-3 bg-gray-800/40 space-y-2">
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
                <textarea value={editForm.bio} onChange={e => setEditForm({ ...editForm, bio: e.target.value })} placeholder="Bio / background…" rows={2} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(guru.id)} disabled={loading === guru.id} className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-medium rounded"><Check className="w-3 h-3" />Save</button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3 inline mr-1" />Cancel</button>
                </div>
              </div>
            )}

            {merging === guru.id && (
              <div className="px-4 py-3 bg-blue-500/5 border-l-2 border-blue-500/40 space-y-2">
                <p className="text-xs text-blue-400 font-medium flex items-center gap-1"><GitMerge className="w-3.5 h-3.5" />Merge <strong>&quot;{guru.name}&quot;</strong> into:</p>
                <div className="flex gap-2">
                  <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} className="flex-1 py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                    <option value="">Select target…</option>
                    {gurus.filter(g => g.id !== guru.id && !g.isIgnored).map(g => <option key={g.id} value={g.id}>{g.name} ({g._count.emails} emails)</option>)}
                  </select>
                  <button onClick={() => doMerge(guru.id)} disabled={!mergeTarget || loading === guru.id} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded"><Check className="w-3 h-3" />Merge</button>
                  <button onClick={() => setMerging(null)} className="px-2 py-1.5 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3" /></button>
                </div>
                <p className="text-xs text-gray-500">The AI will learn these are the same person going forward.</p>
              </div>
            )}
          </div>
        ))}
        {filteredActive.length === 0 && <p className="px-4 py-8 text-center text-gray-500 text-sm">No gurus yet. Run AI analysis and editors will be auto-detected from emails.</p>}
      </div>

      {ignored.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Ignored ({ignored.length}) — hidden everywhere</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {ignored.map(guru => (
              <div key={guru.id} className="flex items-center justify-between px-4 py-3 opacity-50">
                <span className="text-sm text-gray-400 line-through">{guru.name}</span>
                <button onClick={() => toggleIgnore(guru)} className="text-xs text-gray-500 hover:text-green-400 flex items-center gap-1"><Eye className="w-3.5 h-3.5" />Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
