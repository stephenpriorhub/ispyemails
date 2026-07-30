"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type Window = "7" | "30" | "90";
interface PubShare { name: string; count: number; pct: number }
interface Bucket { date: string; total: number; pubs: PubShare[] }
interface TrendData { topic: { id: string; name: string }; days: number; total: number; todayKey: string; buckets: Bucket[] }

const WINDOWS: { k: Window; label: string }[] = [
  { k: "7", label: "7d" },
  { k: "30", label: "30d" },
  { k: "90", label: "90d" },
];

/**
 * Popup showing a topic's daily email volume over the selected window.
 * Hovering a day reveals that day's total and the top 5 publishers by share.
 */
export default function TopicTrendModal({
  topicId, topicName, initialWindow, onClose,
}: {
  topicId: string;
  topicName: string;
  initialWindow: Window;
  onClose: () => void;
}) {
  const [win, setWin] = useState<Window>(initialWindow);
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/topics/${topicId}/trend?days=${win}`)
      .then(r => r.json())
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [topicId, win]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buckets = data?.buckets ?? [];
  const max = Math.max(1, ...buckets.map(b => b.total));
  const n = buckets.length || 1;
  const active = hover !== null ? buckets[hover] : null;

  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="font-semibold text-white text-base capitalize">{topicName}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 -mr-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="text-xs text-gray-500">
            Daily email volume{data ? ` · ${data.total} in last ${win}d` : ""}
          </p>
          <div className="flex gap-1">
            {WINDOWS.map(w => (
              <button
                key={w.k}
                onClick={() => setWin(w.k)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${win === w.k ? "bg-amber-500 text-black font-medium" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-gray-500">Loading…</div>
        ) : buckets.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-gray-500">No data.</div>
        ) : (
          <div className="relative">
            {/* Tooltip */}
            {active && (
              <div
                className="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none bg-gray-950 border border-gray-700 rounded-md p-2.5 shadow-xl min-w-[170px]"
                style={{ left: `${((hover! + 0.5) / n) * 100}%`, top: -6 }}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-xs text-gray-300">{fmtDay(active.date)}</span>
                  <span className="text-xs font-semibold text-amber-400">{active.total} email{active.total !== 1 ? "s" : ""}</span>
                </div>
                {active.total === 0 ? (
                  <p className="text-[11px] text-gray-600">No emails</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-600">Top publishers</p>
                    {active.pubs.map(p => (
                      <div key={p.name} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="text-gray-300 truncate max-w-[110px]">{p.name}</span>
                        <span className="text-gray-400 tabular-nums flex-shrink-0">{p.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bars */}
            <div className="flex items-end gap-px h-56 border-b border-gray-800">
              {buckets.map((b, i) => {
                const isToday = data && b.date === data.todayKey;
                return (
                  <div
                    key={b.date}
                    className="flex-1 h-full flex items-end group cursor-pointer"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className={`w-full rounded-t transition-colors ${hover === i ? "bg-amber-400" : "bg-amber-500/50 group-hover:bg-amber-400/80"} ${isToday ? "ring-1 ring-amber-300/40" : ""}`}
                      style={{ height: `${Math.max(b.total === 0 ? 0 : 3, (b.total / max) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-axis labels: first / middle / last */}
            <div className="flex justify-between mt-1.5 text-[10px] text-gray-600">
              <span>{fmtDay(buckets[0].date)}</span>
              {buckets.length > 2 && <span>{fmtDay(buckets[Math.floor(buckets.length / 2)].date)}</span>}
              <span>{fmtDay(buckets[buckets.length - 1].date)}</span>
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-600 mt-4">Hover a bar to see the day&apos;s top 5 publishers by share.</p>
      </div>
    </div>
  );
}
