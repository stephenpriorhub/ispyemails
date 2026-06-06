"use client";
import { useState } from "react";
import { BookOpen, GitMerge, Pencil, Trash2, EyeOff, Eye, X, Check, Plus, ChevronDown } from "lucide-react";
import StaleIcon from "@/components/StaleIcon";

const CATEGORIES = ["FREE_EDITORIAL", "PAID_EDITORIAL", "HOTLIST", "MARKETING_FILE"] as const;
const catLabel = (c: string) => c.replace("_", " ");
const catColor: Record<string, string> = {
  FREE_EDITORIAL: "bg-blue-500/10 text-blue-400",
  PAID_EDITORIAL: "bg-purple-500/10 text-purple-400",
  HOTLIST: "bg-amber-500/10 text-amber-400",
  MARKETING_FILE: "bg-red-500/10 text-red-400",
};

interface Publisher { id: string; name: string }
interface Guru { id: string; name: string; isIgnored: boolean }
interface ListItem {
  id: string; name: string; category: string; isIgnored: boolean; notes: string | null;
  publisher: Publisher | null;
  gurus: { guru: Guru }[];
  _count: { emails: number };
  isStale?: boolean;
  lastEmail?: Date | string | null;
}

export default function ListsManager({ lists: initial, publishers, primaryGurus = [], isAdmin = false }: { lists: ListItem[]; publishers: Publisher[]; primaryGurus?: { id: string; name: string }[]; isAdmin?: boolean }) {
  const [lists, setLists] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [editForm, setEditForm] = useState({ name: "", category: "FREE_EDITORIAL", publisherId: "", notes: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", category: "FREE_EDITORIAL", publisherId: "" });
  const [loading, setLoading] = useState<string | null>(null);
  const [filterPublisher, setFilterPublisher] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterGuru, setFilterGuru] = useState("all");

  async function addList(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm) });
    const l = await res.json();
    setLists([...lists, { ...l, gurus: [], _count: { emails: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setAddForm({ name: "", category: "FREE_EDITORIAL", publisherId: "" });
    setShowAdd(false);
  }

  async function saveEdit(id: string) {
    setLoading(id);
    const res = await fetch(`/api/lists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editForm.name, category: editForm.category, publisherId: editForm.publisherId || null, notes: editForm.notes || null }) });
    const updated = await res.json();
    setLists(lists.map(l => l.id === id ? { ...l, ...updated, publisher: publishers.find(p => p.id === updated.publisherId) ?? null } : l));
    setEditing(null);
    setLoading(null);
  }

  async function toggleIgnore(list: ListItem) {
    setLoading(list.id);
    const res = await fetch(`/api/lists/${list.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isIgnored: !list.isIgnored }) });
    const u = await res.json();
    setLists(lists.map(l => l.id === list.id ? { ...l, isIgnored: u.isIgnored } : l));
    setLoading(null);
  }

  async function doMerge(sourceId: string) {
    if (!mergeTarget) return;
    const source = lists.find(l => l.id === sourceId)!;
    const target = lists.find(l => l.id === mergeTarget)!;
    if (!confirm(`Merge "${source.name}" into "${target.name}"? All emails and gurus will move to the target.`)) return;
    setLoading(sourceId);
    await fetch("/api/lists/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, targetId: mergeTarget }) });
    setLists(lists.filter(l => l.id !== sourceId));
    setMerging(null); setMergeTarget(""); setLoading(null);
  }

  async function deleteList(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    setLists(lists.filter(l => l.id !== id));
  }

  const active = lists.filter(l => !l.isIgnored);
  const filtered = active
    .filter(l => filterPublisher === "all" || l.publisher?.id === filterPublisher)
    .filter(l => filterCategory === "all" || l.category === filterCategory)
    .filter(l => filterGuru === "all" || l.gurus.some(g => !g.guru.isIgnored && g.guru.id === filterGuru));
  const ignored = lists.filter(l => l.isIgnored);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><BookOpen className="w-6 h-6 text-amber-400" />Lists</h1>
          <p className="text-gray-400 text-sm mt-1">Newsletters and publications — each belongs to a Publisher</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" />Add List
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <select value={filterPublisher} onChange={e => setFilterPublisher(e.target.value)} className="py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
          <option value="all">All publishers</option>
          {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
        {primaryGurus.length > 0 && (
          <select value={filterGuru} onChange={e => setFilterGuru(e.target.value)} className="py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="all">All editors</option>
            {primaryGurus.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-600">{filtered.length} lists</span>
      </div>

      {showAdd && (
        <form onSubmit={addList} className="bg-gray-900 border border-amber-500/30 rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="Newsletter name" className="col-span-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
            <select value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })} className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
              {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select>
            <select value={addForm.publisherId} onChange={e => setAddForm({ ...addForm, publisherId: e.target.value })} className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
              <option value="">No publisher</option>
              {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded">Save</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-1.5 bg-gray-800 text-gray-300 text-sm rounded">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        {filtered.map(list => (
          <div key={list.id}>
            {editing !== list.id && merging !== list.id && (
              <div className="flex items-center gap-4 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{list.name}</span>
                    {list.isStale && list.lastEmail && <StaleIcon lastEmail={list.lastEmail} />}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${catColor[list.category] ?? ""}`}>{catLabel(list.category)}</span>
                    {list.publisher && <span className="text-xs text-gray-500">↳ {list.publisher.name}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    <span>{list._count.emails} emails</span>
                    {list.gurus.filter(g => !g.guru.isIgnored).length > 0 && (
                      <span>Editors: {list.gurus.filter(g => !g.guru.isIgnored).map(g => g.guru.name).join(", ")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`/emails?list=${list.id}`} className="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors" title="View emails">→</a>
                  {isAdmin && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditing(list.id); setEditForm({ name: list.name, category: list.category, publisherId: list.publisher?.id ?? "", notes: list.notes ?? "" }); }} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setMerging(list.id); setMergeTarget(""); }} className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"><GitMerge className="w-3.5 h-3.5" /></button>
                    <button onClick={() => toggleIgnore(list)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteList(list.id, list.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                </div>
              </div>
            )}

            {editing === list.id && (
              <div className="px-4 py-3 bg-gray-800/40 space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="col-span-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
                  <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
                    {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                  </select>
                  <select value={editForm.publisherId} onChange={e => setEditForm({ ...editForm, publisherId: e.target.value })} className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
                    <option value="">No publisher</option>
                    {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes…" rows={2} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(list.id)} disabled={loading === list.id} className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-medium rounded"><Check className="w-3 h-3" />Save</button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3 inline mr-1" />Cancel</button>
                </div>
              </div>
            )}

            {merging === list.id && (
              <div className="px-4 py-3 bg-blue-500/5 border-l-2 border-blue-500/40 space-y-2">
                <p className="text-xs text-blue-400 font-medium flex items-center gap-1"><GitMerge className="w-3.5 h-3.5" />Merge <strong>&quot;{list.name}&quot;</strong> into:</p>
                <div className="flex gap-2">
                  <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} className="flex-1 py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                    <option value="">Select target…</option>
                    {lists.filter(l => l.id !== list.id && !l.isIgnored).map(l => <option key={l.id} value={l.id}>{l.name} ({l._count.emails} emails)</option>)}
                  </select>
                  <button onClick={() => doMerge(list.id)} disabled={!mergeTarget || loading === list.id} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded"><Check className="w-3 h-3" />Merge</button>
                  <button onClick={() => setMerging(null)} className="px-2 py-1.5 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {active.length === 0 && <p className="px-4 py-8 text-center text-gray-500 text-sm">No lists yet. Run a sync and the AI will auto-detect newsletter names.</p>}
      </div>

      {ignored.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Ignored ({ignored.length})</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {ignored.map(list => (
              <div key={list.id} className="flex items-center justify-between px-4 py-3 opacity-50">
                <span className="text-sm text-gray-400 line-through">{list.name}</span>
                <button onClick={() => toggleIgnore(list)} className="text-xs text-gray-500 hover:text-green-400 flex items-center gap-1"><Eye className="w-3.5 h-3.5" />Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
