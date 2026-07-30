import Link from "next/link";
import { Newspaper, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import type { WeeklyDigest } from "@/lib/weekly-digest";

/**
 * "This Week in the Industry" — the rolling-7d topic summary at the top of the
 * dashboard. Theme-first (no individual publishers); each theme links to the
 * matching 7-day filtered email view.
 */
export default function WeeklyDigestCard({ digest }: { digest: WeeklyDigest }) {
  const { weekStart, weekEnd, weekTotal, prevWeekTotal, topicCount, topThemes, risers, fallers, fresh, narrative } = digest;
  const volDelta = prevWeekTotal > 0 ? Math.round(((weekTotal - prevWeekTotal) / prevWeekTotal) * 100) : null;

  const fmtRange = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-900/40 border border-amber-500/20 rounded-lg p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="font-semibold text-white text-sm flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-amber-400" /> This Week in the Industry
        </h2>
        <span className="text-xs text-gray-500">
          {fmtRange(weekStart)} – {fmtRange(weekEnd)} · {weekTotal.toLocaleString()} emails
          {volDelta !== null && (
            <span className={volDelta >= 0 ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
              ({volDelta >= 0 ? "+" : ""}{volDelta}% WoW)
            </span>
          )}
          {" · "}{topicCount} topics
        </span>
      </div>

      {topThemes.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">No topic activity in the last 7 days yet.</p>
      ) : (
        <>
          {/* AI narrative */}
          {narrative && (
            <div className="flex gap-2 mb-4 text-sm text-gray-200 leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-md p-3">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p>{narrative}</p>
            </div>
          )}

          {/* Top themes as clickable pills → 7-day filtered email view */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {topThemes.map(t => (
              <Link
                key={t.id}
                href={`/emails?topic=${t.id}&days=7`}
                className="group flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-amber-500/40 rounded-full pl-3 pr-2 py-1 transition-colors"
                title={`${t.count} emails · ${t.distinctPubs} publishers — view all`}
              >
                <span className="text-xs text-gray-200 capitalize">{t.name}</span>
                <span className="text-xs font-semibold text-amber-400 tabular-nums">{t.count}</span>
                {t.delta !== null && (
                  <span className={`text-[10px] tabular-nums ${t.delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.delta >= 0 ? "+" : ""}{t.delta}%
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* Movers + new */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-gray-500 mb-1.5 flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-green-400" /> Heating up</div>
              <div className="space-y-1">
                {risers.length ? risers.map(r => (
                  <div key={r.name} className="flex items-center justify-between gap-2">
                    <span className="text-gray-300 capitalize truncate">{r.name}</span>
                    <span className="text-green-400 tabular-nums flex-shrink-0">+{r.delta}%</span>
                  </div>
                )) : <span className="text-gray-600">—</span>}
              </div>
            </div>
            <div>
              <div className="text-gray-500 mb-1.5 flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-red-400" /> Cooling off</div>
              <div className="space-y-1">
                {fallers.length ? fallers.map(f => (
                  <div key={f.name} className="flex items-center justify-between gap-2">
                    <span className="text-gray-300 capitalize truncate">{f.name}</span>
                    <span className="text-red-400 tabular-nums flex-shrink-0">{f.delta}%</span>
                  </div>
                )) : <span className="text-gray-600">—</span>}
              </div>
            </div>
            <div>
              <div className="text-gray-500 mb-1.5 flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-400" /> New this week</div>
              <div className="space-y-1">
                {fresh.length ? fresh.map(f => (
                  <div key={f.name} className="flex items-center justify-between gap-2">
                    <span className="text-gray-300 capitalize truncate">{f.name}</span>
                    <span className="text-amber-400 tabular-nums flex-shrink-0">{f.count}</span>
                  </div>
                )) : <span className="text-gray-600">—</span>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
