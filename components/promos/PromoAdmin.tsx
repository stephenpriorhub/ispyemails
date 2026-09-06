"use client";

import { useState } from "react";
import { Megaphone, RefreshCw, FileText } from "lucide-react";

/** Yesterday in ET, as YYYY-MM-DD. */
function etYesterday(): string {
  const now = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export default function PromoAdmin() {
  const [day, setDay] = useState(etYesterday());
  const [scanning, setScanning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);

  async function runScan(force: boolean) {
    setScanning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/cron/promo-scan?day=${day}${force ? "&force=1" : ""}`);
      const d = (await res.json()) as {
        emailsScanned?: number; sightings?: number; newPromos?: number; unresolved?: number;
        errors?: string[]; error?: string;
      };
      setResult(
        d.error
          ? `Failed: ${d.error}`
          : `${d.emailsScanned} emails scanned → ${d.sightings} promos (${d.newPromos} new, ${d.unresolved} with no resolvable link)` +
            (d.errors?.length ? ` · ${d.errors.length} error(s)` : ""),
      );
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setScanning(false);
    }
  }

  async function preview() {
    setPreviewing(true);
    setDigest(null);
    try {
      const res = await fetch(`/api/cron/promo-digest?day=${day}&preview=1`);
      const d = (await res.json()) as { text?: string; error?: string };
      setDigest(d.text ?? `Failed: ${d.error ?? "unknown"}`);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
        <Megaphone className="w-4 h-4 text-amber-400" />Promo Radar
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Resolves each day&apos;s tracking links to the real promo landing pages. Runs automatically at
        00:05 ET, with a catch-up pass before the 08:00 ET report. Use this to backfill an earlier day
        or to preview the report before it posts to Slack.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="px-2.5 py-2 bg-gray-950 border border-gray-800 rounded text-sm text-gray-200"
        />
        <button
          onClick={() => runScan(false)}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Resolving links…" : "Scan day"}
        </button>
        <button
          onClick={() => runScan(true)}
          disabled={scanning}
          title="Re-resolve every email for this day, including ones already scanned"
          className="px-3 py-2 border border-gray-700 hover:border-gray-500 disabled:opacity-50 text-gray-300 text-sm rounded transition-colors"
        >
          Re-scan
        </button>
        <button
          onClick={preview}
          disabled={previewing}
          className="flex items-center gap-2 px-3 py-2 border border-gray-700 hover:border-gray-500 disabled:opacity-50 text-gray-300 text-sm rounded transition-colors"
        >
          <FileText className={`w-3.5 h-3.5 ${previewing ? "animate-pulse" : ""}`} />
          {previewing ? "Building…" : "Preview report"}
        </button>
      </div>

      {result && <p className="mt-3 text-xs text-gray-300">{result}</p>}
      {digest && (
        <pre className="mt-3 p-3 bg-gray-950 border border-gray-800 rounded text-[11px] text-gray-300 whitespace-pre-wrap max-h-96 overflow-auto">
          {digest}
        </pre>
      )}
    </div>
  );
}
