"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ExternalLink, Film, Loader2, CheckCircle2, AlertCircle, Search, X, Sparkles, Pencil,
} from "lucide-react";

interface Mailer {
  publisherId: string | null;
  publisher: string;
  listId: string | null;
  list: string | null;
  subject: string;
  emailId: string;
}
interface Promo {
  id: string;
  headline: string | null;
  headlineSource: string | null;
  url: string;
  displayUrl: string;
  host: string;
  lastStatus: number | null;
  advertiser: { id: string; label: string; domain: string; isInternal: boolean; isPlatform: boolean };
  advertiserLabelOverride: string | null;
  kind: string;
  daysDetected: number;
  firstSeenOn: string;
  isNew: boolean;
  vidripperJobId: string | null;
  vidripperStatus: string | null;
  promoReviewId: string | null;
  mailers: Mailer[];
}
interface DayGroup { day: string; promos: Promo[] }

interface Props {
  publishers: { id: string; name: string }[];
  lists: { id: string; name: string }[];
  isAdmin: boolean;
}

const RIP_LABEL: Record<string, string> = {
  ripping: "Ripping video…",
  transcribing: "Transcribing…",
  analyzing: "Analyzing…",
  done: "View analysis",
  error: "Rip failed",
};

export default function PromoFeed({ publishers, lists, isAdmin }: Props) {
  const [days, setDays] = useState<DayGroup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ publisher: "", list: "", scope: "", kind: "", q: "" });
  const sentinel = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const query = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams();
      if (next) p.set("cursor", next);
      if (filters.publisher) p.set("publisher", filters.publisher);
      if (filters.list) p.set("list", filters.list);
      if (filters.scope) p.set("scope", filters.scope);
      if (filters.kind) p.set("kind", filters.kind);
      if (filters.q) p.set("q", filters.q);
      return `/api/promos?${p.toString()}`;
    },
    [filters],
  );

  const load = useCallback(
    async (next: string | null, replace: boolean) => {
      const mine = ++reqId.current;
      setLoading(true);
      try {
        const res = await fetch(query(next));
        const data = (await res.json()) as { days: DayGroup[]; nextCursor: string | null };
        if (mine !== reqId.current) return; // a newer filter change already won
        setDays((prev) => (replace ? data.days : [...prev, ...data.days]));
        setCursor(data.nextCursor);
        setDone(!data.nextCursor);
        if (replace && !data.days.length) setDone(true);
      } finally {
        if (mine === reqId.current) setLoading(false);
      }
    },
    [query],
  );

  // Filters restart the feed from the top. `load(..., replace)` swaps the list
  // in when the response lands rather than blanking it here, so changing a
  // filter doesn't flash an empty feed.
  useEffect(() => {
    void (async () => { await load(null, true); })();
  }, [load]);

  // Infinite scroll — pull the next few days as the sentinel comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && cursor) load(cursor, false); },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, done, loading, load]);

  const patch = (promoId: string, changes: Partial<Promo>) =>
    setDays((prev) =>
      prev.map((d) => ({ ...d, promos: d.promos.map((p) => (p.id === promoId ? { ...p, ...changes } : p)) })),
    );

  const set = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const active = filters.publisher || filters.list || filters.scope || filters.kind || filters.q;

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-white">Promo Radar</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every promo landing page the industry mailed, resolved from the tracking links in each email.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value);
          }}
        >
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search headline, advertiser or URL"
            className="pl-8 pr-3 py-1.5 w-64 bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
        </form>

        <select value={filters.publisher} onChange={(e) => set("publisher", e.target.value)} className={selectCls}>
          <option value="">All publishers</option>
          {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filters.list} onChange={(e) => set("list", e.target.value)} className={selectCls}>
          <option value="">All lists</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select value={filters.scope} onChange={(e) => set("scope", e.target.value)} className={selectCls}>
          <option value="">Everyone</option>
          <option value="external">External only</option>
          <option value="internal">Oxford Group only</option>
        </select>

        <select value={filters.kind} onChange={(e) => set("kind", e.target.value)} className={selectCls}>
          <option value="">Promos &amp; lead-gen</option>
          <option value="VSL">VSL promos only</option>
          <option value="LEAD_GEN">Lead-gen offers only</option>
          <option value="EQUITY_RAISE">Equity raises (hidden by default)</option>
        </select>

        {active && (
          <button
            onClick={() => setFilters({ publisher: "", list: "", scope: "", kind: "", q: "" })}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-800 rounded-md"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Feed */}
      {days.map((group) => (
        <section key={group.day} className="mb-8">
          <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur py-2 mb-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-amber-400">{formatDay(group.day)}</h2>
            <p className="text-xs text-gray-600">
              {group.promos.length} promo{group.promos.length === 1 ? "" : "s"} ·{" "}
              {group.promos.filter((p) => p.isNew).length} new
            </p>
          </div>
          <div className="space-y-2">
            {group.promos.map((p) => (
              <PromoRow key={`${group.day}-${p.id}`} promo={p} isAdmin={isAdmin} onChange={patch} />
            ))}
          </div>
        </section>
      ))}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}
      {!loading && !days.length && (
        <p className="text-sm text-gray-500 py-10">
          No promos recorded yet. The scan runs at midnight ET; an admin can trigger it from Settings.
        </p>
      )}
      {done && days.length > 0 && <p className="text-xs text-gray-700 py-6">— end of the record —</p>}
      <div ref={sentinel} className="h-px" />
    </div>
  );
}

const selectCls =
  "px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-300 focus:outline-none focus:border-amber-500/50";

function PromoRow({
  promo, isAdmin, onChange,
}: {
  promo: Promo;
  isAdmin: boolean;
  onChange: (id: string, changes: Partial<Promo>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingAdvertiser, setEditingAdvertiser] = useState(false);
  const advertiserName = promo.advertiserLabelOverride ?? promo.advertiser.label;
  const status = promo.vidripperStatus;
  const inFlight = status === "ripping" || status === "transcribing" || status === "analyzing";

  // Poll while VidRipper is working; the route advances the pipeline as it goes.
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/promos/${promo.id}/rip`);
      if (!res.ok) return;
      const d = (await res.json()) as { status: string | null; reviewId: string | null };
      onChange(promo.id, { vidripperStatus: d.status, promoReviewId: d.reviewId });
    }, 20_000);
    return () => clearInterval(t);
  }, [inFlight, promo.id, onChange]);

  async function rip() {
    setBusy(true);
    try {
      const res = await fetch(`/api/promos/${promo.id}/rip`, { method: "POST" });
      const d = (await res.json()) as { status?: string; jobId?: string; reviewId?: string | null; error?: string };
      onChange(promo.id, {
        vidripperStatus: d.error ? "error" : (d.status ?? "ripping"),
        vidripperJobId: d.jobId ?? null,
        promoReviewId: d.reviewId ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveAdvertiser(advertiser: string) {
    setEditingAdvertiser(false);
    if (!advertiser.trim() || advertiser === advertiserName) return;
    onChange(promo.id, promo.advertiser.isPlatform
      ? { advertiserLabelOverride: advertiser }
      : { advertiser: { ...promo.advertiser, label: advertiser } });
    await fetch(`/api/promos/${promo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ advertiser }),
    });
  }

  async function saveHeadline(headline: string) {
    setEditing(false);
    if (!headline.trim() || headline === promo.headline) return;
    onChange(promo.id, { headline, headlineSource: "MANUAL" });
    await fetch(`/api/promos/${promo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headline }),
    });
  }

  return (
    <div className="border border-gray-800 rounded-lg p-3 bg-gray-900/40 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {editingAdvertiser ? (
              <input
                autoFocus
                defaultValue={advertiserName}
                onBlur={(e) => saveAdvertiser(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingAdvertiser(false);
                }}
                className="px-1.5 py-0.5 bg-gray-950 border border-amber-500/40 rounded text-xs text-white focus:outline-none"
              />
            ) : (
              <button
                onClick={() => isAdmin && setEditingAdvertiser(true)}
                disabled={!isAdmin}
                title={
                  promo.advertiser.isPlatform
                    ? `Hosted on ${promo.advertiser.domain}, which names no advertiser — set who this promo is actually from`
                    : `Rename ${promo.advertiser.domain} everywhere`
                }
                className={`text-xs font-medium ${
                  promo.advertiser.isInternal ? "text-green-400" : "text-gray-300"
                } ${isAdmin ? "hover:text-amber-400" : "cursor-default"}`}
              >
                {advertiserName}
              </button>
            )}
            {promo.advertiser.isPlatform && !promo.advertiserLabelOverride && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-300"
                title="The landing page is on a shared platform, so the advertiser can't be read from the domain"
              >
                unattributed
              </span>
            )}
            {promo.kind === "LEAD_GEN" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-300" title="Non-VSL page capturing name, email and/or phone">
                lead-gen
              </span>
            )}
            {promo.kind === "EQUITY_RAISE" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300" title="A startup raise bought on a finpub list — not a competitor offer">
                equity raise
              </span>
            )}
            {promo.isNew && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400">
                <Sparkles className="w-2.5 h-2.5" /> NEW
              </span>
            )}
            {promo.daysDetected > 1 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400">
                {promo.daysDetected} days detected
              </span>
            )}
            {promo.lastStatus === 403 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400" title="Landing page is Cloudflare-gated — headline fell back to the subject line">
                gated
              </span>
            )}
            {promo.headlineSource === "SUBJECT" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-500" title="No headline could be read off the page — showing the email subject">
                from subject
              </span>
            )}
          </div>

          {editing ? (
            <input
              autoFocus
              defaultValue={promo.headline ?? ""}
              onBlur={(e) => saveHeadline(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full px-2 py-1 bg-gray-950 border border-amber-500/40 rounded text-sm text-white focus:outline-none"
            />
          ) : (
            <div className="flex items-start gap-1.5 group">
              <a
                href={promo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white hover:text-amber-400 font-medium leading-snug"
              >
                {promo.headline ?? "(no headline)"}
              </a>
              {isAdmin && (
                <button
                  onClick={() => setEditing(true)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-300 mt-0.5"
                  title="Correct this headline"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <a
            href={promo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 mt-1 break-all"
          >
            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            {/* Show the tracking junk stripped out; the link itself keeps it. */}
            {promo.displayUrl.length > 110 ? `${promo.displayUrl.slice(0, 110)}…` : promo.displayUrl}
          </a>

          {/* One chip per list, not per send — an affiliate file can mail the
              same promo six times in a day. */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {dedupeMailers(promo.mailers).map(({ mailer, count, subjects }) => (
              <Link
                key={mailer.emailId}
                href={`/emails/${mailer.emailId}`}
                title={subjects.join("\n")}
                className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800/70 text-gray-400 hover:text-amber-400"
              >
                {mailer.list ?? mailer.publisher}
                {count > 1 && <span className="text-gray-600"> ×{count}</span>}
              </Link>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="flex-shrink-0">
            {promo.promoReviewId ? (
              <a
                href={`https://analyzer.oxfordhub.app/?review=${promo.promoReviewId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> View analysis
              </a>
            ) : status === "error" ? (
              <button
                onClick={rip}
                title="VidRipper could not process this page — click to retry"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                <AlertCircle className="w-3.5 h-3.5" /> Retry rip
              </button>
            ) : inFlight || busy ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-gray-800 text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {RIP_LABEL[status ?? "ripping"] ?? "Working…"}
              </span>
            ) : (
              <button
                onClick={rip}
                title="Rip the video, transcribe it, and send it to the Promo Analyzer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              >
                <Film className="w-3.5 h-3.5" /> Rip &amp; analyze
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function dedupeMailers(mailers: Mailer[]) {
  const byName = new Map<string, { mailer: Mailer; count: number; subjects: string[] }>();
  for (const m of mailers) {
    const name = m.list ?? m.publisher;
    const entry = byName.get(name);
    if (entry) {
      entry.count++;
      if (entry.subjects.length < 8) entry.subjects.push(m.subject);
    } else {
      byName.set(name, { mailer: m, count: 1, subjects: [m.subject] });
    }
  }
  return [...byName.values()];
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
