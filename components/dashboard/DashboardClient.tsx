"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";

interface StaleItem { id: string; name: string; lastEmail: Date | string | null }
interface Props {
  currentDate?: string;
  stalePublishers?: StaleItem[];
  staleLists?: StaleItem[];
  showStale?: boolean;
}

function formatDaysAgo(date: Date | string | null): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
}

export default function DashboardClient({ currentDate, stalePublishers = [], staleLists = [], showStale }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  // Date picker (rendered inline between prev/next buttons)
  if (!showStale) {
    return (
      <input
        type="date"
        value={currentDate ?? ""}
        max={new Date().toISOString().split("T")[0]}
        onChange={e => { if (e.target.value) router.push(`/?date=${e.target.value}`); }}
        className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-amber-500"
      />
    );
  }

  if (dismissed) return null;
  const total = stalePublishers.length + staleLists.length;

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-amber-400">
            {total} file{total !== 1 ? "s" : ""} went silent — no emails in 6+ days
          </h3>
        </div>
        <button onClick={() => setDismissed(true)} className="text-gray-500 hover:text-gray-300 transition-colors ml-4">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-6">
        {stalePublishers.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Publishers</p>
            <div className="space-y-1.5">
              {stalePublishers.map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <a href="/publishers" className="text-sm text-white hover:text-amber-400 transition-colors">{p.name}</a>
                  <span className="text-xs text-gray-500 ml-2">{formatDaysAgo(p.lastEmail)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {staleLists.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Lists</p>
            <div className="space-y-1.5">
              {staleLists.map(l => (
                <div key={l.id} className="flex items-center justify-between">
                  <a href="/lists" className="text-sm text-white hover:text-amber-400 transition-colors">{l.name}</a>
                  <span className="text-xs text-gray-500 ml-2">{formatDaysAgo(l.lastEmail)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-600 mt-3">May have been removed from their list. Dismiss to hide until you revisit.</p>
    </div>
  );
}
