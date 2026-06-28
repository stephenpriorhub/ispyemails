"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
interface EmailResult { id:string;subject:string;fromEmail:string;fromName:string|null;receivedAt:string;snippet:string|null;inboxPlacement:string;publisher:{name:string}|null;topics:{topic:{name:string}}[] }
export default function SearchPage() {
  const [query,setQuery] = useState(""), [results,setResults] = useState<EmailResult[]>([]), [total,setTotal] = useState(0), [loading,setLoading] = useState(false), [searched,setSearched] = useState(false);
  async function doSearch(e: React.FormEvent) {
    e.preventDefault(); if (!query.trim()) return;
    setLoading(true); setSearched(true);
    const data = await (await fetch(`/api/emails?q=${encodeURIComponent(query)}&limit=50`)).json();
    setResults(data.emails); setTotal(data.total); setLoading(false);
  }
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Search className="w-6 h-6 text-amber-400"/>Search</h1><p className="text-gray-400 text-sm mt-1">Search subjects, body content, topics, and senders.</p></div>
      <form onSubmit={doSearch} className="mb-6">
        <div className="flex gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search all emails…" className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-sm"/></div>
          <button type="submit" disabled={loading} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-medium rounded-lg transition-colors">{loading?"Searching…":"Search"}</button>
        </div>
      </form>
      {searched&&<div><p className="text-sm text-gray-400 mb-4">{total} result{total!==1?"s":""} for &quot;{query}&quot;</p><div className="space-y-2">{results.map(email=>(
        <Link key={email.id} href={`/emails/${email.id}`} className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0"><p className="text-white font-medium truncate">{email.subject}</p><p className="text-xs text-gray-500 mt-1">{email.publisher?.name??email.fromEmail} · {new Date(email.receivedAt).toLocaleDateString()}</p>{email.snippet&&<p className="text-xs text-gray-400 mt-2 line-clamp-2">{email.snippet}</p>}</div>
            <div className="flex flex-col items-end gap-1"><span className="text-xs text-gray-500">{email.inboxPlacement}</span><div className="flex gap-1">{email.topics.slice(0,2).map(({topic})=><span key={topic.name} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded capitalize">{topic.name}</span>)}</div></div>
          </div>
        </Link>
      ))}{results.length===0&&<p className="text-center text-gray-500 py-12">No results found.</p>}</div></div>}
    </div>
  );
}
