"use client";
import { useState } from "react";
import { User, GitMerge, Trash2, EyeOff, Eye, X, Check, Plus, ChevronDown, Users } from "lucide-react";

interface Publisher { id: string; name: string }
interface ListRef { id: string; name: string; publisher: { id: string; name: string } | null }
interface GuruListItem { listId: string; guruId: string; isPrimary: boolean; isIgnored: boolean; list: ListRef }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SecondaryLink = any;
interface SecondaryLinkDEL {
  secondaryVoiceId: string; primaryGuruId: string;
  secondaryVoice: { id: string; name: string };
  primaryGuru: { id: string; name: string };
}
interface GuruItem {
  id: string; name: string; notes: string | null;
  isIgnored: boolean; isSecondaryVoice: boolean;
  publisherId: string | null; publisher: Publisher | null;
  lists: GuruListItem[];
  primaryGurus: SecondaryLink[];
  secondaryVoices: SecondaryLink[];
  _count: { emails: number };
}

export default function GurusManager({ gurus: initial, lists, publishers, isAdmin = false }: { gurus: GuruItem[]; lists: ListRef[]; publishers: Publisher[]; isAdmin?: boolean }) {
  const [gurus, setGurus] = useState(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [filterPublisher, setFilterPublisher] = useState("all");
  const [addingListFor, setAddingListFor] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState("");

  // Edit form state per guru
  const [editState, setEditState] = useState<Record<string, { name: string; publisherId: string }>>({});

  const primaryGurus = gurus.filter(g => !g.isSecondaryVoice && !g.isIgnored);
  const secondaryVoices = gurus.filter(g => g.isSecondaryVoice && !g.isIgnored);
  const ignoredGurus = gurus.filter(g => g.isIgnored);

  const filtered = filterPublisher === "all"
    ? primaryGurus
    : primaryGurus.filter(g =>
        g.publisherId === filterPublisher ||
        g.lists.some(l => !l.isIgnored && l.list.publisher?.id === filterPublisher)
      );

  function openEdit(guru: GuruItem) {
    setEditState(prev => ({ ...prev, [guru.id]: { name: guru.name, publisherId: guru.publisherId ?? "" } }));
    setExpandedId(guru.id);
  }

  async function saveGuru(id: string) {
    const state = editState[id];
    if (!state) return;
    setLoading(id);
    await fetch(`/api/gurus/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: state.name.trim(), publisherId: state.publisherId || null }),
    });
    setGurus(gurus.map(g => g.id === id ? {
      ...g,
      name: state.name.trim(),
      publisherId: state.publisherId || null,
      publisher: publishers.find(p => p.id === state.publisherId) ?? null,
    } : g));
    setLoading(null);
  }

  async function addGuru(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    const res = await fetch("/api/gurus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: addName.trim() }) });
    const g = await res.json();
    setGurus([...gurus, { ...g, lists: [], primaryGurus: [], secondaryVoices: [], publisher: null, _count: { emails: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setAddName(""); setShowAdd(false);
  }

  // Mark as secondary voice — auto-associates via shared lists
  async function markSecondary(guru: GuruItem) {
    setLoading(guru.id);
    await fetch(`/api/gurus/${guru.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isSecondaryVoice: true }) });
    // Auto-associate: find primary gurus sharing the same lists
    for (const { list } of guru.lists.filter(l => !l.isIgnored)) {
      const primaryOnSameList = gurus.filter(g =>
        !g.isSecondaryVoice && g.id !== guru.id &&
        g.lists.some(gl => !gl.isIgnored && gl.listId === list.id)
      );
      for (const primary of primaryOnSameList) {
        await fetch(`/api/gurus/${primary.id}/secondary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secondaryVoiceId: guru.id }),
        });
      }
    }
    setGurus(gurus.map(g => g.id === guru.id ? { ...g, isSecondaryVoice: true } : g));
    setLoading(null);
  }

  async function promoteToGuru(sv: GuruItem) {
    setLoading(sv.id);
    await fetch(`/api/gurus/${sv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isSecondaryVoice: false }) });
    setGurus(gurus.map(g => g.id === sv.id ? { ...g, isSecondaryVoice: false } : g));
    setLoading(null);
  }

  async function removeSecondaryFromPrimary(primaryId: string, secondaryVoiceId: string) {
    await fetch(`/api/gurus/${primaryId}/secondary`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondaryVoiceId }),
    });
    setGurus(gurus.map(g => g.id === primaryId
      ? { ...g, secondaryVoices: g.secondaryVoices.filter(sv => sv.secondaryVoiceId !== secondaryVoiceId) }
      : g
    ));
  }

  async function assignList(guruId: string, listId: string) {
    await fetch(`/api/gurus/${guruId}/lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId }) });
    const list = lists.find(l => l.id === listId)!;
    setGurus(gurus.map(g => g.id === guruId ? {
      ...g, lists: [...g.lists.filter(l => l.listId !== listId), { listId, guruId, isPrimary: false, isIgnored: false, list }]
    } : g));
    setAddingListFor(null); setSelectedListId("");
  }

  async function removeList(guruId: string, listId: string) {
    await fetch(`/api/gurus/${guruId}/lists`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId }) });
    setGurus(gurus.map(g => g.id === guruId
      ? { ...g, lists: g.lists.map(l => l.listId === listId ? { ...l, isIgnored: true } : l) }
      : g
    ));
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
    if (!confirm(`Merge "${source.name}" into "${target.name}"?`)) return;
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

  function GRow({ guru }: { guru: GuruItem }) {
    const isExpanded = expandedId === guru.id;
    const edit = editState[guru.id];
    const activeLists = guru.lists.filter(l => !l.isIgnored);
    const availableLists = lists.filter(l => !guru.lists.some(gl => gl.listId === l.id && !gl.isIgnored));

    return (
      <div>
        {merging !== guru.id && (
          <div>
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/20 group">
              <button onClick={() => setExpandedId(isExpanded ? null : guru.id)} className="flex-shrink-0">
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : guru.id)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white">{guru.name}</span>
                  {guru.publisher && <span className="text-xs text-gray-500">· {guru.publisher.name}</span>}
                  <span className="text-xs text-gray-600">{guru._count.emails} emails</span>
                </div>
                {!isExpanded && activeLists.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {activeLists.map(({ list }) => (
                      <span key={list.id} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{list.name}</span>
                    ))}
                  </div>
                )}
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a href={`/emails?guru=${guru.id}`} onClick={e=>e.stopPropagation()} className="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors" title="View emails">→</a>
                {isAdmin && <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(guru)} className="px-2 py-1 text-xs text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors">Edit</button>
                <button onClick={() => markSecondary(guru)} disabled={loading === guru.id} className="px-2 py-1 text-xs text-gray-400 hover:text-purple-400 hover:bg-gray-800 rounded transition-colors" title="Mark as secondary voice">2°</button>
                <button onClick={() => { setMerging(guru.id); setMergeTarget(""); }} className="px-2 py-1 text-xs text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors">Merge</button>
                <button onClick={() => toggleIgnore(guru)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteGuru(guru.id, guru.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>}
              </div>
            </div>

            {/* Expanded panel — admin only for editing */}
            {isExpanded && (
              <div className="px-10 pb-4 space-y-4 bg-gray-800/10">
                {/* Edit name + publisher — admin only */}
                {isAdmin && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Name</label>
                    <input
                      value={edit?.name ?? guru.name}
                      onChange={e => setEditState(prev => ({ ...prev, [guru.id]: { ...prev[guru.id], name: e.target.value } }))}
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Publisher</label>
                    <select
                      value={edit?.publisherId ?? guru.publisherId ?? ""}
                      onChange={e => setEditState(prev => ({ ...prev, [guru.id]: { ...prev[guru.id] ?? { name: guru.name }, publisherId: e.target.value } }))}
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">No publisher</option>
                      {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>}
                {isAdmin && (
                  <button
                    onClick={() => saveGuru(guru.id)}
                    disabled={loading === guru.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-medium rounded transition-colors"
                  >
                    <Check className="w-3 h-3" />Save changes
                  </button>
                )}

                {/* Lists */}
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1.5">Lists / Publications</p>
                  <div className="space-y-1">
                    {activeLists.map(({ list, listId }) => (
                      <div key={listId} className="flex items-center gap-2 group/l">
                        <span className="text-sm text-white flex-1">{list.name}
                          {list.publisher && <span className="text-gray-500 ml-1.5 text-xs">· {list.publisher.name}</span>}
                        </span>
                        <button onClick={() => removeList(guru.id, listId)} className="opacity-0 group-hover/l:opacity-100 text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition-opacity px-2 py-0.5 rounded hover:bg-gray-800">
                          <X className="w-3 h-3" />False
                        </button>
                      </div>
                    ))}
                    {activeLists.length === 0 && <p className="text-xs text-gray-600 italic">No lists — AI will auto-detect</p>}
                    {addingListFor === guru.id ? (
                      <div className="flex gap-2 pt-1">
                        <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)} className="flex-1 py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
                          <option value="">Select list…</option>
                          {availableLists.map(l => <option key={l.id} value={l.id}>{l.name}{l.publisher ? ` (${l.publisher.name})` : ""}</option>)}
                        </select>
                        <button onClick={() => selectedListId && assignList(guru.id, selectedListId)} disabled={!selectedListId} className="flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-medium rounded"><Check className="w-3 h-3" />Assign</button>
                        <button onClick={() => setAddingListFor(null)} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingListFor(guru.id); setSelectedListId(""); }} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 pt-1">
                        <Plus className="w-3 h-3" />Assign to list
                      </button>
                    )}
                  </div>
                </div>

                {/* Secondary voices linked to this guru */}
                {guru.secondaryVoices.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1.5">Secondary Voices</p>
                    <div className="space-y-1">
                      {guru.secondaryVoices.map(sv => (
                        <div key={sv.secondaryVoiceId} className="flex items-center gap-2 group/sv">
                          <span className="text-sm text-gray-300 flex-1">{sv.secondaryVoice.name}</span>
                          <button onClick={() => removeSecondaryFromPrimary(guru.id, sv.secondaryVoiceId)} className="opacity-0 group-hover/sv:opacity-100 text-xs text-gray-500 hover:text-red-400 transition-opacity"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {merging === guru.id && (
          <div className="px-4 py-3 bg-blue-500/5 border-l-2 border-blue-500/40 space-y-2">
            <p className="text-xs text-blue-400 font-medium">Merge <strong>&quot;{guru.name}&quot;</strong> into:</p>
            <div className="flex gap-2">
              <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} className="flex-1 py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                <option value="">Select target…</option>
                {gurus.filter(g => g.id !== guru.id && !g.isIgnored).map(g => <option key={g.id} value={g.id}>{g.name} ({g._count.emails} emails)</option>)}
              </select>
              <button onClick={() => doMerge(guru.id)} disabled={!mergeTarget || loading === guru.id} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded"><Check className="w-3 h-3" />Merge</button>
              <button onClick={() => setMerging(null)} className="px-2 py-1.5 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3" /></button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><User className="w-6 h-6 text-amber-400" />Gurus</h1>
          <p className="text-gray-400 text-sm mt-1">Click Edit to rename and assign publisher. Use 2° to mark as secondary voice.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg flex-shrink-0">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">Add Guru</span><span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-gray-500">Filter by publisher:</span>
        <select value={filterPublisher} onChange={e => setFilterPublisher(e.target.value)} className="py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
          <option value="all">All publishers</option>
          {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-xs text-gray-600">{filtered.length} gurus</span>
      </div>

      {showAdd && (
        <form onSubmit={addGuru} className="flex gap-3 mb-4 bg-gray-900 border border-amber-500/30 rounded-lg p-3">
          <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Guru name…" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
          <button type="submit" className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded">Cancel</button>
        </form>
      )}

      {/* Primary guru list */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800 mb-6">
        {filtered.map(guru => <GRow key={guru.id} guru={guru} />)}
        {filtered.length === 0 && <p className="px-4 py-8 text-center text-gray-500 text-sm">No gurus yet. Run Initialize in Settings to auto-detect from emails.</p>}
      </div>

      {/* Secondary Voices */}
      {secondaryVoices.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-300">Secondary Voices</h2>
            <span className="text-xs text-gray-600">— contributors & managing editors, not in email filters</span>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {secondaryVoices.map(sv => (
              <div key={sv.id} className="flex items-center justify-between px-4 py-2.5 group">
                <div>
                  <span className="text-sm text-gray-300">{sv.name}</span>
                  {sv.primaryGurus.length > 0 && (
                    <span className="text-xs text-gray-600 ml-2">
                      → {sv.primaryGurus.map(p => p.primaryGuru.name).join(", ")}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => promoteToGuru(sv)} disabled={loading === sv.id} className="text-xs text-gray-500 hover:text-green-400 px-2 py-1 rounded hover:bg-gray-800" title="Promote to primary guru">↑ Promote</button>
                  <button onClick={() => toggleIgnore(sv)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteGuru(sv.id, sv.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ignored */}
      {ignoredGurus.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Ignored ({ignoredGurus.length})</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {ignoredGurus.map(guru => (
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
