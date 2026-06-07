"use client";
import { useState } from "react";
import { Settings, Mail, CheckCircle, AlertCircle, Plus, Database, RefreshCw, Brain } from "lucide-react";

interface Account { email:string;isActive:boolean;lastSyncAt:Date|null;historyId:string|null }
interface Props { accounts:Account[];connected:boolean;error?:string;isAdmin?:boolean }

export default function SettingsClient({ accounts, connected, error, isAdmin = false }: Props) {
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [fixingLists, setFixingLists] = useState(false);
  const [fixListResult, setFixListResult] = useState<string | null>(null);

  async function runFixMissingLists() {
    setFixingLists(true);
    setFixListResult(null);
    let totalFixed = 0;
    let remaining = 1;
    let pass = 0;
    try {
      while (remaining > 0 && pass < 100) {
        pass++;
        const res = await fetch("/api/sync", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 8 }),
        });
        const data = await res.json();
        if (!res.ok) { setFixListResult(`❌ Error: ${data.error ?? "unknown"}`); break; }
        totalFixed += data.processed ?? 0;
        remaining = data.remaining ?? 0;
        setFixListResult(`Fixing… ${totalFixed} done, ${remaining} still missing lists`);
        if (remaining === 0) break;
      }
      setFixListResult(`✅ Done — re-analyzed ${totalFixed} emails that were missing list detection.`);
    } catch (err) {
      setFixListResult(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setFixingLists(false);
    }
  }

  async function runExtractLearnings() {
    setExtracting(true);
    setExtractResult(null);
    try {
      const res = await fetch("/api/learnings/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      setExtractResult(`✅ Scanned ${data.scanned} emails — extracted ${data.extracted} new intelligence insights.`);
    } catch (err) {
      setExtractResult(`❌ Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setExtracting(false);
    }
  }

  async function runInitialize() {
    setInitializing(true);
    setInitResult(null);
    try {
      // 1. Seed publishers + reset all emails to unprocessed
      const cleanup = await fetch("/api/cleanup", { method: "POST" });
      const cleanupData = await cleanup.json();
      setInitResult(`Seeded ${cleanupData.publishersSeeded} publishers, reset ${cleanupData.emailsReset ?? 0} emails. Starting AI analysis…`);

      // 2. Process in batches of 8 until done (avoids Railway timeouts)
      let totalProcessed = 0;
      let remaining = cleanupData.emailsReset ?? 1;
      let pass = 0;
      while (remaining > 0 && pass < 50) {
        pass++;
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 8 }),
        });
        const data = await res.json();
        if (!res.ok) { setInitResult(`❌ Analysis error: ${data.error ?? "unknown"}`); break; }
        totalProcessed += data.processed ?? 0;
        remaining = data.remaining ?? 0;
        setInitResult(`Analyzing… ${totalProcessed} done, ${remaining} remaining`);
        if (remaining === 0) break;
      }

      setInitResult(`✅ Done — ${totalProcessed} emails analyzed. Check Lists, Gurus & Topics tabs.`);
    } catch (err) {
      setInitResult(`❌ Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setInitializing(false);
      setAnalyzing(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-amber-400" />Settings
        </h1>
      </div>

      {connected && (
        <div className="mb-4 flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="w-4 h-4" />Gmail account connected successfully!
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4" />Error: {error}
        </div>
      )}

      {/* Gmail Accounts */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg mb-6">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-400" />Gmail Accounts
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Connect your spy Gmail account. All emails sync automatically every 15 min.</p>
          </div>
          {isAdmin && (
            <a href="/api/gmail/connect" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded transition-colors">
              <Plus className="w-3.5 h-3.5" />Connect Gmail
            </a>
          )}
        </div>
        <div className="divide-y divide-gray-800">
          {accounts.map(account => (
            <div key={account.email} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-white">{account.email}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {account.lastSyncAt ? `Last synced: ${new Date(account.lastSyncAt).toLocaleString()}` : "Never synced"}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${account.isActive ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                {account.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">No Gmail accounts connected yet.</div>
          )}
        </div>
      </div>

      {/* Initialize / Re-analyze — admin only */}
      {!isAdmin && <p className="text-xs text-gray-600 mb-4">Contact an admin to manage sync settings.</p>}
      {isAdmin && <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-amber-400" />Initialize Publishers &amp; Analysis
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Seeds all known financial publishers, matches existing emails to publishers by domain,
          then runs AI analysis on every email to assign topics, email type, and offer details.
          Run this once after first sync, or any time to re-analyze everything.
        </p>
        <button
          onClick={runInitialize}
          disabled={initializing}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${initializing ? "animate-spin" : ""}`} />
          {analyzing ? "Running AI analysis…" : initializing ? "Seeding publishers…" : "Initialize / Re-analyze All"}
        </button>
        {initResult && (
          <p className="mt-3 text-xs text-gray-300">{initResult}</p>
        )}
      </div>}

      {/* Extract learnings from past emails */}
      {isAdmin && <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-amber-400" />Extract Intelligence from Past Emails
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Scans the last 30 days of emails and extracts significant insights into the Intelligence feed —
          without re-running full analysis. Use this to backfill learnings from emails already processed.
        </p>
        <button
          onClick={runExtractLearnings}
          disabled={extracting}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded transition-colors"
        >
          <Brain className={`w-3.5 h-3.5 ${extracting ? "animate-pulse" : ""}`} />
          {extracting ? "Scanning emails…" : "Extract Intelligence (Last 30 Days)"}
        </button>
        {extractResult && (
          <p className="mt-3 text-xs text-gray-300">{extractResult}</p>
        )}
      </div>}

      {/* Fix emails missing list detection */}
      {isAdmin && <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <RefreshCw className="w-4 h-4 text-blue-400" />Fix Missing Lists
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Re-analyzes emails that have no list assigned yet. Runs in batches so it never times out.
          Use this if Initialize didn&apos;t fully detect newsletter names.
        </p>
        <button
          onClick={runFixMissingLists}
          disabled={fixingLists}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fixingLists ? "animate-spin" : ""}`} />
          {fixingLists ? "Fixing…" : "Fix Missing Lists"}
        </button>
        {fixListResult && <p className="mt-3 text-xs text-gray-300">{fixListResult}</p>}
      </div>}
    </div>
  );
}
