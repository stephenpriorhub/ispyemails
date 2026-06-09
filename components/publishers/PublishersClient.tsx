"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Mail, TrendingUp, Pencil, Trash2, GitMerge, Check, X, Plus } from "lucide-react";
import StaleIcon from "@/components/StaleIcon";

const PUB_TYPES = ["INTERNAL", "COMPETITOR", "AFFILIATE_MARKETER"] as const;
const typeLabel = (t: string) => t === "AFFILIATE_MARKETER" ? "Affiliate" : t === "INTERNAL" ? "Internal" : "Competitor";
const typeColor: Record<string, string> = { INTERNAL: "bg-green-500/10 text-green-400", COMPETITOR: "bg-amber-500/10 text-amber-400", AFFILIATE_MARKETER: "bg-red-500/10 text-red-400" };

interface Publisher {
  id: string; name: string; type: string;
  domains: string[]; knownFromAddresses: string[];
  website: string | null; notes: string | null; isConfirmed: boolean;
  lists: { id: string; name: string }[];
  _count: { emails: number };
  isStale?: boolean;
  lastEmail?: Date | string | null;
}

interface Props {
  publishers: Publisher[];
  weekMap: Record<string, number>;
  isAdmin?: boolean;
}

export default function PublishersClient({ publishers: initial, weekMap, isAdmin = false }: Props) {
  const [publishers, setPublishers] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", domains: "", website: "", notes: "", type: "COMPETITOR" });
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", domains: "", website: "" });

  function startEdit(pub: Publisher) {
    setEditing(pub.id);
    setEditForm({ name: pub.name, domains: pub.domains.join(", "), website: pub.website ?? "", notes: pub.notes ?? "", type: pub.type ?? "COMPETITOR" });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const res = await fetch(`/api/publishers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name.trim(),
        type: editForm.type,
        domains: editForm.domains.split(",").map((d) => d.trim()).filter(Boolean),
        website: editForm.website.trim() || null,
        notes: editForm.notes.trim() || null,
      }),
    });
    const updated = await res.json();
    setPublishers(publishers.map((p) => p.id === id ? { ...p, ...updated } : p));
    setEditing(null);
    setSaving(false);
  }

  async function deletePublisher(id: string, name: string) {
    if (!confirm(`Delete "${name}"?\n\nEmails from this publisher will become unassigned (not deleted). The system will stop recognizing their emails until re-trained.`)) return;
    await fetch(`/api/publishers/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unassignEmails: true }) });
    setPublishers(publishers.filter((p) => p.id !== id));
  }

  async function doMerge(sourceId: string) {
    if (!mergeTargetId) return;
    const source = publishers.find((p) => p.id === sourceId)!;
    const target = publishers.find((p) => p.id === mergeTargetId)!;
    if (!confirm(`Merge "${source.name}" INTO "${target.name}"?\n\nAll emails from ${source.name} will move to ${target.name}. Domains and sender addresses will be combined. "${source.name}" will be deleted.`)) return;
    setSaving(true);
    await fetch("/api/publishers/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId: mergeTargetId }),
    });
    setPublishers(publishers.filter((p) => p.id !== sourceId));
    setMerging(null);
    setMergeTargetId("");
    setSaving(false);
  }

  async function addPublisher(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/publishers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addForm.name.trim(),
        domains: addForm.domains.split(",").map((d) => d.trim()).filter(Boolean),
        website: addForm.website.trim() || null,
      }),
    });
    const pub = await res.json();
    setPublishers([...publishers, { ...pub, _count: { emails: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setAddForm({ name: "", domains: "", website: "" });
    setShowAdd(false);
    setSaving(false);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            Publishers
          </h1>
          <p className="text-gray-400 text-sm mt-1">{publishers.length} publishers — edit, merge, or delete to train the system</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Publisher
          </button>
        )}
      </div>

      {/* Add publisher form */}
      {showAdd && (
        <form onSubmit={addPublisher} className="bg-gray-900 border border-amber-500/30 rounded-lg p-4 mb-6 space-y-3">
          <h2 className="text-sm font-semibold text-amber-400">New Publisher</h2>
          <div className="grid grid-cols-3 gap-3">
            <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Name (e.g. Weiss Ratings)" className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
            <input value={addForm.domains} onChange={(e) => setAddForm({ ...addForm, domains: e.target.value })} placeholder="Domains: weissratings.com, weiss.com" className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
            <input value={addForm.website} onChange={(e) => setAddForm({ ...addForm, website: e.target.value })} placeholder="Website (optional)" className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded transition-colors">Save</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Publisher list */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        {publishers.map((pub) => (
          <div key={pub.id}>
            {/* Normal row */}
            {editing !== pub.id && merging !== pub.id && (
              <div className="flex items-center gap-4 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{pub.name}</span>
                    {pub.isStale && pub.lastEmail && <StaleIcon lastEmail={pub.lastEmail} />}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${typeColor[pub.type] ?? typeColor.COMPETITOR}`}>{typeLabel(pub.type)}</span>
                    {!pub.isConfirmed && (
                      <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">AI guess</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" />{pub._count.emails} emails</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" />{weekMap[pub.id] ?? 0} this week</span>
                    {pub.domains.length > 0 && (
                      <span className="text-xs text-gray-600">{pub.domains.slice(0, 2).join(", ")}</span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Link href={`/emails?publisher=${pub.id}`} className="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors" title="View emails">→</Link>
                  {isAdmin && <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(pub)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setMerging(pub.id); setMergeTargetId(""); }} className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors" title="Merge into another publisher">
                    <GitMerge className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deletePublisher(pub.id, pub.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors" title="Delete (unassigns emails)">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>}
                </div>
              </div>
            )}

            {/* Edit row — admin only */}
            {!isAdmin && editing === pub.id && (() => { setEditing(null); return null; })()}
            {/* Edit row */}
            {editing === pub.id && (
              <div className="px-4 py-3 space-y-3 bg-gray-800/40">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Name</label>
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Domains (comma-separated)</label>
                    <input value={editForm.domains} onChange={(e) => setEditForm({ ...editForm, domains: e.target.value })} placeholder="weissratings.com, weiss.com" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Website</label>
                    <input value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Type</label>
                    <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500">
                      {PUB_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                    <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(pub.id)} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-medium rounded transition-colors">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditing(null)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Merge row */}
            {merging === pub.id && (
              <div className="px-4 py-3 bg-blue-500/5 border-l-2 border-blue-500/40 space-y-2">
                <p className="text-xs text-blue-400 font-medium flex items-center gap-1"><GitMerge className="w-3.5 h-3.5" /> Merge <strong>{pub.name}</strong> into:</p>
                <div className="flex gap-2">
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="flex-1 py-1.5 px-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select target publisher…</option>
                    {publishers.filter((p) => p.id !== pub.id).map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p._count.emails} emails)</option>
                    ))}
                  </select>
                  <button onClick={() => doMerge(pub.id)} disabled={!mergeTargetId || saving} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors">
                    <GitMerge className="w-3 h-3" /> Merge
                  </button>
                  <button onClick={() => setMerging(null)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
                <p className="text-xs text-gray-500">All emails + domains + sender addresses will be combined. The source publisher will be deleted.</p>
              </div>
            )}
          </div>
        ))}

        {publishers.length === 0 && (
          <div className="px-4 py-12 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No publishers yet. Run a sync to auto-detect from incoming emails.</p>
          </div>
        )}
      </div>
    </div>
  );
}
