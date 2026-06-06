"use client";
import { useState } from "react";
import { User, GitMerge, Trash2, EyeOff, Eye, X, Check, Plus, ChevronDown, Users } from "lucide-react";

interface ListRef { id: string; name: string; publisher: { id: string; name: string } | null }
interface GuruListItem { listId: string; guruId: string; isPrimary: boolean; isIgnored: boolean; list: ListRef }
interface SecondaryLink { secondaryVoiceId: string; primaryGuruId: string; primaryGuru: { id: string; name: string } }
interface GuruItem {
  id: string; name: string; notes: string | null; isIgnored: boolean; isSecondaryVoice: boolean;
  lists: GuruListItem[];
  primaryGurus: SecondaryLink[];   // for secondary voices: their primary guru assignments
  secondaryVoices: { secondaryVoiceId: string; primaryGuruId: string; secondaryVoice: { id: string; name: string } }[];
  _count: { emails: number };
}
interface Publisher { id: string; name: string }

export default function GurusManager({ gurus: initial, lists, publishers }: { gurus: GuruItem[]; lists: ListRef[]; publishers: Publisher[] }) {
  const [gurus, setGurus] = useState(initial);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addIsSecondary, setAddIsSecondary] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPublisher, setFilterPublisher] = useState("all");
  const [addingListFor, setAddingListFor] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState("");
  const [addingSecondaryFor, setAddingSecondaryFor] = useState<string | null>(null); // primary guru id
  const [selectedSecondaryId, setSelectedSecondaryId] = useState("");
  const [addingPrimaryFor, setAddingPrimaryFor] = useState<string | null>(null); // secondary voice id
  const [selectedPrimaryId, setSelectedPrimaryId] = useState("");

  const primaryGurus = gurus.filter(g => !g.isSecondaryVoice && !g.isIgnored);
  const secondaryVoices = gurus.filter(g => g.isSecondaryVoice && !g.isIgnored);
  const ignoredGurus = gurus.filter(g => g.isIgnored);

  const filteredPrimary = filterPublisher === "all"
    ? primaryGurus
    : primaryGurus.filter(g => g.lists.some(l => !l.isIgnored && l.list.publisher?.id === filterPublisher));

  async function addGuru(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    const res = await fetch("/api/gurus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: addName.trim(), isSecondaryVoice: addIsSecondary }) });
    const g = await res.json();
    setGurus([...gurus, { ...g, lists: [], primaryGurus: [], secondaryVoices: [], _count: { emails: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setAddName(""); setAddIsSecondary(false); setShowAdd(false);
  }

  async function assignList(guruId: string, listId: string, isPrimary = false) {
    await fetch(`/api/gurus/${guruId}/lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId, isPrimary }) });
    const list = lists.find(l => l.id === listId)!;
    setGurus(gurus.map(g => g.id === guruId ? { ...g, lists: [...g.lists.filter(l => l.listId !== listId), { listId, guruId, isPrimary, isIgnored: false, list }] } : g));
    setAddingListFor(null); setSelectedListId("");
  }

  async function ignoreListAssoc(guruId: string, listId: string) {
    await fetch(`/api/gurus/${guruId}/lists`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId }) });
    setGurus(gurus.map(g => g.id === guruId ? { ...g, lists: g.lists.map(l => l.listId === listId ? { ...l, isIgnored: true } : l) } : g));
  }

  async function restoreListAssoc(guruId: string, listId: string) {
    await fetch(`/api/gurus/${guruId}/lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId }) });
    setGurus(gurus.map(g => g.id === guruId ? { ...g, lists: g.lists.map(l => l.listId === listId ? { ...l, isIgnored: false } : l) } : g));
  }

  async function assignSecondaryVoice(primaryGuruId: string, secondaryVoiceId: string) {
    await fetch(`/api/gurus/${primaryGuruId}/secondary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secondaryVoiceId }) });
    const sv = gurus.find(g => g.id === secondaryVoiceId)!;
    setGurus(gurus.map(g => g.id === primaryGuruId ? { ...g, secondaryVoices: [...g.secondaryVoices, { secondaryVoiceId, primaryGuruId, secondaryVoice: { id: sv.id, name: sv.name } }] } : g));
    setAddingSecondaryFor(null); setSelectedSecondaryId("");
  }

  async function removeSecondaryVoice(primaryGuruId: string, secondaryVoiceId: string) {
    await fetch(`/api/gurus/${primaryGuruId}/secondary`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secondaryVoiceId }) });
    setGurus(gurus.map(g => g.id === primaryGuruId ? { ...g, secondaryVoices: g.secondaryVoices.filter(sv => sv.secondaryVoiceId !== secondaryVoiceId) } : g));
  }

  async function assignPrimaryGuru(secondaryVoiceId: string, primaryGuruId: string) {
    await fetch(`/api/gurus/${primaryGuruId}/secondary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secondaryVoiceId }) });
    const pg = gurus.find(g => g.id === primaryGuruId)!;
    setGurus(gurus.map(g => g.id === secondaryVoiceId ? { ...g, primaryGurus: [...g.primaryGurus, { secondaryVoiceId, primaryGuruId, primaryGuru: { id: pg.id, name: pg.name } }] } : g));
    setAddingPrimaryFor(null); setSelectedPrimaryId("");
  }

  async function removePrimaryGuru(secondaryVoiceId: string, primaryGuruId: string) {
    await fetch(`/api/gurus/${primaryGuruId}/secondary`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secondaryVoiceId }) });
    setGurus(gurus.map(g => g.id === secondaryVoiceId ? { ...g, primaryGurus: g.primaryGurus.filter(p => p.primaryGuruId !== primaryGuruId) } : g));
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

  function GuruRow({ guru }: { guru: GuruItem }) {
    const activeLists = guru.lists.filter(l => !l.isIgnored);
    const ignoredLists = guru.lists.filter(l => l.isIgnored);
    const isExpanded = expandedId === guru.id;
    const availableLists = lists.filter(l => !guru.lists.some(gl => gl.listId === l.id && !gl.isIgnored));

    return (
      <div>
        {merging !== guru.id && (
          <div>
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/30 group" onClick={() => setExpandedId(isExpanded ? null : guru.id)}>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{guru.name}</span>
                  <span className="text-xs text-gray-600">{guru._count.emails} emails</span>
                </div>
                {!isExpanded && activeLists.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {activeLists.map(({ list, isPrimary }) => (
                      <span key={list.id} className={`text-xs px-1.5 py-0.5 rounded ${isPrimary ? "bg-amber-500/10 text-amber-400" : "bg-gray-700 text-gray-400"}`}>
                        {list.name}{list.publisher ? ` · ${list.publisher.name}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setMerging(guru.id); setMergeTarget(""); }} className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"><GitMerge className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggleIgnore(guru)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded" title="Ignore everywhere"><EyeOff className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteGuru(guru.id, guru.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-10 pb-4 space-y-3">
                {/* List associations */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">Lists</p>
                  <div className="space-y-1">
                    {activeLists.map(({ list, isPrimary, listId }) => (
                      <div key={listId} className="flex items-center gap-2 group/item">
                        <span className="text-sm text-white flex-1">{list.name}{list.publisher && <span className="text-gray-500 ml-1.5 text-xs">· {list.publisher.name}</span>}</span>
                        {isPrimary && <span className="text-xs bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">Primary</span>}
                        <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          {!isPrimary && <button onClick={() => assignList(guru.id, listId, true)} className="text-xs text-gray-500 hover:text-amber-400 px-2 py-0.5 rounded hover:bg-gray-800">★ Primary</button>}
                          <button onClick={() => ignoreListAssoc(guru.id, listId)} className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-800"><X className="w-3 h-3" />False</button>
                        </div>
                      </div>
                    ))}
                    {activeLists.length === 0 && <p className="text-xs text-gray-600 italic">No lists — AI will auto-detect from emails</p>}
                    {ignoredLists.length > 0 && (
                      <div className="pt-1">
                        <p className="text-xs text-gray-600 mb-1">Rejected (AI trained to ignore):</p>
                        {ignoredLists.map(({ list, listId }) => (
                          <div key={listId} className="flex items-center gap-2 opacity-50">
                            <span className="text-xs text-gray-500 line-through">{list.name}</span>
                            <button onClick={() => restoreListAssoc(guru.id, listId)} className="text-xs text-gray-600 hover:text-green-400 flex items-center gap-1"><Eye className="w-3 h-3" />Restore</button>
                          </div>
                        ))}
                      </div>
                    )}
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
                      <button onClick={() => { setAddingListFor(guru.id); setSelectedListId(""); }} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 pt-1"><Plus className="w-3 h-3" />Assign to list</button>
                    )}
                  </div>
                </div>

                {/* Secondary voices linked to this primary guru */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">Secondary Voices</p>
                  <div className="space-y-1">
                    {guru.secondaryVoices.map(sv => (
                      <div key={sv.secondaryVoiceId} className="flex items-center gap-2 group/sv">
                        <span className="text-sm text-gray-300 flex-1">{sv.secondaryVoice.name}</span>
                        <button onClick={() => removeSecondaryVoice(guru.id, sv.secondaryVoiceId)} className="opacity-0 group-hover/sv:opacity-100 text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition-opacity"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    {guru.secondaryVoices.length === 0 && <p className="text-xs text-gray-600 italic">No secondary voices assigned</p>}
                    {addingSecondaryFor === guru.id ? (
                      <div className="flex gap-2 pt-1">
                        <select value={selectedSecondaryId} onChange={e => setSelectedSecondaryId(e.target.value)} className="flex-1 py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
                          <option value="">Select secondary voice…</option>
                          {secondaryVoices.filter(sv => !guru.secondaryVoices.some(s => s.secondaryVoiceId === sv.id)).map(sv => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                        </select>
                        <button onClick={() => selectedSecondaryId && assignSecondaryVoice(guru.id, selectedSecondaryId)} disabled={!selectedSecondaryId} className="flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-medium rounded"><Check className="w-3 h-3" />Link</button>
                        <button onClick={() => setAddingSecondaryFor(null)} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingSecondaryFor(guru.id); setSelectedSecondaryId(""); }} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 pt-1"><Plus className="w-3 h-3" />Link secondary voice</button>
                    )}
                  </div>
                </div>
              </div>
            )}
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><User className="w-6 h-6 text-amber-400" />Gurus</h1>
          <p className="text-gray-400 text-sm mt-1">Primary editors and their supporting secondary voices</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg"><Plus className="w-4 h-4" />Add</button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500">Filter by publisher:</span>
        <select value={filterPublisher} onChange={e => setFilterPublisher(e.target.value)} className="py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
          <option value="all">All publishers</option>
          {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-xs text-gray-600">{filteredPrimary.length} gurus</span>
      </div>

      {showAdd && (
        <div className="flex gap-3 mb-4 bg-gray-900 border border-amber-500/30 rounded-lg p-3">
          <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Name…" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={addIsSecondary} onChange={e => setAddIsSecondary(e.target.checked)} className="rounded" />
            Secondary Voice
          </label>
          <button onClick={addGuru as unknown as React.MouseEventHandler} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded">Add</button>
          <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded">Cancel</button>
        </div>
      )}

      {/* Primary gurus */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800 mb-6">
        {filteredPrimary.map(guru => <GuruRow key={guru.id} guru={guru} />)}
        {filteredPrimary.length === 0 && <p className="px-4 py-8 text-center text-gray-500 text-sm">No gurus yet. Run Initialize in Settings to auto-detect from emails.</p>}
      </div>

      {/* Secondary Voices section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-300">Secondary Voices</h2>
          <span className="text-xs text-gray-600">— contributors, managing editors, publishers. Not shown in email guru filter.</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {secondaryVoices.map(sv => {
            const isExpanded = expandedId === sv.id;
            const availablePrimary = primaryGurus.filter(pg => !sv.primaryGurus.some(p => p.primaryGuruId === pg.id));
            return (
              <div key={sv.id}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/30 group" onClick={() => setExpandedId(isExpanded ? null : sv.id)}>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-300">{sv.name}</span>
                      <span className="text-xs text-gray-600">{sv._count.emails} emails</span>
                    </div>
                    {!isExpanded && sv.primaryGurus.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">Supports: {sv.primaryGurus.map(p => p.primaryGuru.name).join(", ")}</p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleIgnore(sv)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteGuru(sv.id, sv.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-10 pb-3 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Assigned to primary gurus:</p>
                    {sv.primaryGurus.map(p => (
                      <div key={p.primaryGuruId} className="flex items-center gap-2 group/pg">
                        <span className="text-sm text-white flex-1">{p.primaryGuru.name}</span>
                        <button onClick={() => removePrimaryGuru(sv.id, p.primaryGuruId)} className="opacity-0 group-hover/pg:opacity-100 text-xs text-gray-500 hover:text-red-400 transition-opacity"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {sv.primaryGurus.length === 0 && <p className="text-xs text-gray-600 italic">Not assigned to any primary guru yet</p>}
                    {addingPrimaryFor === sv.id ? (
                      <div className="flex gap-2 pt-1">
                        <select value={selectedPrimaryId} onChange={e => setSelectedPrimaryId(e.target.value)} className="flex-1 py-1 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
                          <option value="">Select primary guru…</option>
                          {availablePrimary.map(pg => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
                        </select>
                        <button onClick={() => selectedPrimaryId && assignPrimaryGuru(sv.id, selectedPrimaryId)} disabled={!selectedPrimaryId} className="flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-medium rounded"><Check className="w-3 h-3" />Assign</button>
                        <button onClick={() => setAddingPrimaryFor(null)} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingPrimaryFor(sv.id); setSelectedPrimaryId(""); }} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 pt-1"><Plus className="w-3 h-3" />Assign to primary guru</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {secondaryVoices.length === 0 && <p className="px-4 py-6 text-center text-gray-600 text-sm">No secondary voices yet. Add one using the Add button above and check "Secondary Voice".</p>}
        </div>
      </div>

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
