"use client";
import { useState } from "react";
import Link from "next/link";
import { TrendingUp, BarChart2 } from "lucide-react";
import TopicTrendModal from "./TopicTrendModal";

interface TrendItem { id: string; name: string; count: number }
type Window = "7" | "30" | "90";

const WINDOWS: { k: Window; label: string }[] = [
  { k: "7", label: "7d" },
  { k: "30", label: "30d" },
  { k: "90", label: "90d" },
];

/**
 * Trending investment topics — # of emails tagged with each PRIMARY topic over
 * the selected window. Secondary/ignored topics are excluded upstream so this
 * stays a clean read on what competitors are actually pushing.
 *
 * Each row links to the matching filtered email view (topic + window), and a
 * chart button opens a per-topic daily-trend popup with publisher breakdown.
 */
export default function TopicTrendChart({ trends }: { trends: Record<Window, TrendItem[]> }) {
  const [win, setWin] = useState<Window>("30");
  const [modal, setModal] = useState<{ id: string; name: string } | null>(null);
  const data = trends[win] ?? [];
  const max = Math.max(1, ...data.map(d => d.count));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-semibold text-white text-sm flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-amber-400" /> Trending Investment Topics
        </h2>
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
      {data.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">No topic activity in the last {win} days.</p>
      ) : (
        <div className="space-y-1.5">
          {data.map(d => (
            <div key={d.id} className="flex items-center gap-3 group">
              <button
                onClick={() => setModal({ id: d.id, name: d.name })}
                title="View daily trend + publisher breakdown"
                className="flex-shrink-0 text-gray-600 hover:text-amber-400 transition-colors"
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
              <Link
                href={`/emails?topic=${d.id}&days=${win}`}
                title={`View the ${d.count} emails tagged “${d.name}” in the last ${win} days`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <span className="text-xs text-gray-300 w-40 flex-shrink-0 truncate capitalize text-right group-hover:text-amber-400 transition-colors" title={d.name}>{d.name}</span>
                <div className="flex-1 bg-gray-800/60 rounded h-4 overflow-hidden">
                  <div className="h-full bg-amber-500/70 group-hover:bg-amber-500 rounded transition-colors" style={{ width: `${(d.count / max) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-8 flex-shrink-0 tabular-nums">{d.count}</span>
              </Link>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TopicTrendModal
          topicId={modal.id}
          topicName={modal.name}
          initialWindow={win}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
