"use client";
import { Settings, Mail, CheckCircle, AlertCircle, Plus } from "lucide-react";
interface Account { email:string;isActive:boolean;lastSyncAt:Date|null;historyId:string|null }
interface Props { accounts:Account[];connected:boolean;error?:string }
export default function SettingsClient({ accounts,connected,error }: Props) {
  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Settings className="w-6 h-6 text-amber-400"/>Settings</h1></div>
      {connected&&<div className="mb-4 flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg text-sm"><CheckCircle className="w-4 h-4"/>Gmail account connected successfully!</div>}
      {error&&<div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm"><AlertCircle className="w-4 h-4"/>Error: {error}</div>}
      <div className="bg-gray-900 border border-gray-800 rounded-lg mb-6">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div><h2 className="font-semibold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-amber-400"/>Gmail Accounts</h2><p className="text-xs text-gray-500 mt-0.5">Connect your spy Gmail account. All emails sync automatically.</p></div>
          <a href="/api/gmail/connect" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded transition-colors"><Plus className="w-3.5 h-3.5"/>Connect Gmail</a>
        </div>
        <div className="divide-y divide-gray-800">
          {accounts.map(account=><div key={account.email} className="flex items-center justify-between px-4 py-3"><div><p className="text-sm text-white">{account.email}</p><p className="text-xs text-gray-500 mt-0.5">{account.lastSyncAt?`Last synced: ${new Date(account.lastSyncAt).toLocaleString()}`:"Never synced"}</p></div><span className={`text-xs px-2 py-0.5 rounded ${account.isActive?"bg-green-500/10 text-green-400":"bg-gray-500/10 text-gray-400"}`}>{account.isActive?"Active":"Inactive"}</span></div>)}
          {accounts.length===0&&<div className="px-4 py-8 text-center text-gray-500 text-sm">No Gmail accounts connected yet.<br/><span className="text-gray-600 text-xs mt-1 block">Create a dedicated spy Gmail account and subscribe to all competitor newsletters from it.</span></div>}
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4"><h2 className="font-semibold text-white mb-3">Setup Checklist</h2><ol className="space-y-3 text-sm text-gray-400">
        <li className="flex gap-3"><span className="text-amber-400 font-bold flex-shrink-0">1.</span><span>Create a dedicated Gmail spy account (e.g. <code className="text-amber-300">ispyemails.mta@gmail.com</code>) and subscribe to all competitor newsletters from it.</span></li>
        <li className="flex gap-3"><span className="text-amber-400 font-bold flex-shrink-0">2.</span><span>In Google Cloud Console → OAuth consent screen → add your spy Gmail as a test user.</span></li>
        <li className="flex gap-3"><span className="text-amber-400 font-bold flex-shrink-0">3.</span><span>Add redirect URI <code className="text-amber-300">http://localhost:3002/api/gmail/callback</code> to your OAuth credentials.</span></li>
        <li className="flex gap-3"><span className="text-amber-400 font-bold flex-shrink-0">4.</span><span>Click <strong className="text-white">Connect Gmail</strong> above and authorize your spy account.</span></li>
        <li className="flex gap-3"><span className="text-amber-400 font-bold flex-shrink-0">5.</span><span>Hit <strong className="text-white">Sync Now</strong> in the sidebar to import emails.</span></li>
      </ol></div>
    </div>
  );
}
