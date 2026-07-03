import { AlertTriangle } from "lucide-react";

interface SilentItem { id: string; name: string; lastEmail: Date | string | null }

function daysAgo(date: Date | string | null): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

/**
 * Quiet "went silent" footer — shown at the very bottom of the Publishers, Lists
 * and Gurus pages. Replaces the noisy home-page alert: same signal (nothing in
 * 6+ days), but out of the way instead of interrupting the daily briefing.
 */
export default function WentSilent({ items, entity }: { items: SilentItem[]; entity: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-10 border-t border-gray-800 pt-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-3.5 h-3.5 text-gray-600" />
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Went silent — no emails in 6+ days ({items.length} {entity})
        </h3>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map(i => (
          <span key={i.id} className="text-xs text-gray-500">
            {i.name}<span className="text-gray-600 ml-1">· {daysAgo(i.lastEmail)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
