"use client";
import { useState } from "react";
import { Settings, Mail, CheckCircle, AlertCircle, Plus, Database, RefreshCw } from "lucide-react";

interface Account { email:string;isActive:boolean;lastSyncAt:Date|null;historyId:string|null }
interface Props { accounts:Account[];connected:boolean;error?:string }

export default function SettingsClient({ accounts, connected, error }: Props) {
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function runInitialize() {
    setInitializing(true);
    setInitResult(null);
    try {
      // 1. Seed publishers + match existing emails by domain
      // 1. Reset + seed publishers (fast)
      const cleanup = await fetch("/api/cleanup", { method: "POST" });
      const cleanupData = await cleanup.json();

      // 2. Fire AI analysis in background — don't await, it takes time
      fetch("/api/sync", { method: "POST" }).catch(() => {});

      setInitResult(
        `✅ Seeded ${cleanupData.publishersSeeded} publishers, reset ${cleanupData.emailsReset ?? "all"} emails. ` +
        `AI analysis is running in the background — check Lists & Gurus tabs in ~1 minute.`
      );
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
          <a href="/api/gmail/connect" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded transition-colors">
            <Plus className="w-3.5 h-3.5" />Connect Gmail
          </a>
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

      {/* Initialize / Re-analyze */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
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
      </div>
    </div>
  );
}
