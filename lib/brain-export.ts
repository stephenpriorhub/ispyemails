/**
 * brain-export.ts
 *
 * Shared library for pushing validated iSpy learnings to the brain vault.
 * Used by:
 *   - /api/learnings/export  (manual "Push All to Brain" button)
 *   - /api/cron/brain-sync   (automated 6-hour scheduled push)
 */

import { prisma } from "@/lib/prisma";
import { toGuruLiveIntelItem } from "@/lib/guru-live-intel";

// Brain API base URL. Prefer BRAIN_API_URL (the canonical name in REGISTRY.md);
// fall back to the legacy BRAIN_URL, then the known default. Never hardcode.
const BRAIN_URL =
  process.env.BRAIN_API_URL ?? process.env.BRAIN_URL ?? "https://brain.oxfordhub.app";
const HUB_API_TOKEN = process.env.HUB_API_TOKEN ?? "";

/** Minimum confidence score for auto-approval (no human validation needed) */
export const AUTO_APPROVE_CONFIDENCE = 0.75;

/** Minimum number of corroborating emails from the same publisher/entity */
export const AUTO_APPROVE_MIN_CORROBORATION = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

type FetchedLearning = Awaited<ReturnType<typeof fetchEligibleLearnings>>[number];

interface GroupedLearnings {
  byGuru: Record<string, { name: string; id: string; publisherName?: string; items: FetchedLearning[] }>;
  byPublisher: Record<string, { name: string; id: string; items: FetchedLearning[] }>;
  byList: Record<string, { name: string; id: string; publisherName?: string; items: FetchedLearning[] }>;
  general: FetchedLearning[];
}

export interface BrainExportResult {
  pushed: number;
  skipped: number;
  errors: string[];
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

/**
 * Fetch all learnings that are eligible to push to brain.
 * Eligible = (manually VALIDATED) OR (auto-approved by confidence gate)
 * AND not yet pushed (appendedToBrain === false).
 *
 * The confidence gate auto-approves PENDING AI_EMAIL learnings that are
 * corroborated by >= AUTO_APPROVE_MIN_CORROBORATION emails from the same entity.
 * Confidence is measured by corroboration count rather than a stored score field,
 * since the Learning model does not carry a per-record confidence column.
 */
async function fetchEligibleLearnings() {
  // 1. Pull all un-pushed AI_EMAIL learnings
  const candidates = await prisma.learning.findMany({
    where: {
      source: "AI_EMAIL",
      appendedToBrain: false,
    },
    include: {
      guru: { select: { name: true, publisher: { select: { name: true } } } },
      publisher: { select: { name: true } },
      list: { select: { name: true, publisher: { select: { name: true } } } },
      // gmailMessageId + emailType feed the per-guru "currently talking about"
      // live-intel items (sourceEmailId + tactic) sent to the Brain API.
      email: { select: { subject: true, receivedAt: true, gmailMessageId: true, emailType: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 2. Build corroboration map: count distinct emailIds per entity+content cluster.
  //    Two learnings are "corroborating" if they share the same entity and have
  //    >= AUTO_APPROVE_CONFIDENCE word overlap.
  const eligible: typeof candidates = [];

  for (const l of candidates) {
    // Already human-validated — always include
    if (l.status === "VALIDATED") {
      eligible.push(l);
      continue;
    }

    // Contradicted learnings never auto-approve
    if (l.isContradicted) continue;

    // PENDING or IGNORED — apply auto-approval gate
    if (l.status !== "PENDING") continue;

    const corroborationCount = await countCorroborations(l, candidates);
    if (corroborationCount >= AUTO_APPROVE_MIN_CORROBORATION) {
      eligible.push(l);
    }
  }

  return eligible;
}

/**
 * Count how many other learnings in the pool corroborate the given learning.
 * Corroboration = same entity + significant word overlap.
 */
function countCorroborations(
  target: FetchedLearning,
  pool: FetchedLearning[],
): number {
  const targetWords = significantWords(target.content);
  let count = 0;

  for (const other of pool) {
    if (other.id === target.id) continue;

    // Must belong to the same entity
    const sameEntity =
      (target.guruId && other.guruId === target.guruId) ||
      (target.publisherId && other.publisherId === target.publisherId) ||
      (target.listId && other.listId === target.listId);

    if (!sameEntity) continue;

    const overlap = wordOverlapSets(targetWords, significantWords(other.content));
    if (overlap >= AUTO_APPROVE_CONFIDENCE) count++;
  }

  return count;
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

function groupLearnings(learnings: FetchedLearning[]): GroupedLearnings {
  const byGuru: GroupedLearnings["byGuru"] = {};
  const byPublisher: GroupedLearnings["byPublisher"] = {};
  const byList: GroupedLearnings["byList"] = {};
  const general: FetchedLearning[] = [];

  for (const l of learnings) {
    if (l.guruId && l.guru) {
      if (!byGuru[l.guruId])
        byGuru[l.guruId] = { name: l.guru.name, id: l.guruId, publisherName: l.guru.publisher?.name, items: [] };
      byGuru[l.guruId].items.push(l);
    } else if (l.publisherId && l.publisher) {
      if (!byPublisher[l.publisherId])
        byPublisher[l.publisherId] = { name: l.publisher.name, id: l.publisherId, items: [] };
      byPublisher[l.publisherId].items.push(l);
    } else if (l.listId && l.list) {
      if (!byList[l.listId])
        byList[l.listId] = { name: l.list.name, id: l.listId, publisherName: l.list.publisher?.name, items: [] };
      byList[l.listId].items.push(l);
    } else {
      general.push(l);
    }
  }

  return { byGuru, byPublisher, byList, general };
}

// ─── Per-guru live-intel push (Brain API `guru-live-intel`) ───────────────────
//
// The Learning → GuruLiveIntelItem mapping lives in lib/guru-live-intel.ts
// (pure, Prisma-free, unit-tested). Here we only batch + POST it.

/**
 * Push per-guru live intel to the Brain API, ONE batched `guru-live-intel` POST per guru.
 *
 * Autonomy: operates only on the already-gated `byGuru` groups produced upstream by
 * fetchEligibleLearnings() (VALIDATED or auto-approved-by-corroboration) — it adds NO
 * human-approval step and applies no new gate of its own.
 *
 * Cadence: called once per nightly/on-demand export run, aggregated per guru — never per-email.
 *
 * Graceful failure: a Brain API error for one guru is collected into `errors` and the loop
 * continues; it NEVER throws, so it cannot crash the surrounding sync. It also does not affect
 * whether learnings are marked appendedToBrain (the back-compat `blocks` push owns that).
 */
async function pushGuruLiveIntel(
  byGuru: GroupedLearnings["byGuru"],
): Promise<{ posted: number; errors: string[] }> {
  const errors: string[] = [];
  let posted = 0;

  for (const { name, publisherName, items } of Object.values(byGuru)) {
    const guru = name?.trim();
    if (!guru) continue;

    const intelItems = items.map(l => toGuruLiveIntelItem(l, publisherName));
    if (!intelItems.length) continue;

    try {
      const res = await fetch(`${BRAIN_URL}/api/intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": HUB_API_TOKEN },
        body: JSON.stringify({ kind: "guru-live-intel", guru, items: intelItems }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        errors.push(`guru-live-intel for "${guru}" failed (HTTP ${res.status}): ${body}`);
        continue;
      }

      const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      if (!data || data.ok !== true) {
        errors.push(`guru-live-intel for "${guru}" reported failure (not { ok: true }): ${JSON.stringify(data)}`);
        continue;
      }

      posted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`guru-live-intel for "${guru}" network error: ${msg}`);
    }
  }

  return { posted, errors };
}

// ─── Core export function ─────────────────────────────────────────────────────

/**
 * Main export function. Fetches eligible learnings, groups them, pushes to brain,
 * and marks them as appended. Returns a result summary.
 */
export async function exportLearningsToBrain(): Promise<BrainExportResult> {
  if (!HUB_API_TOKEN) {
    return { pushed: 0, skipped: 0, errors: ["HUB_API_TOKEN not configured"] };
  }

  const learnings = await fetchEligibleLearnings();

  if (!learnings.length) {
    return { pushed: 0, skipped: 0, errors: [] };
  }

  const { byGuru, byPublisher, byList, general } = groupLearnings(learnings);

  const blocks = [
    ...Object.values(byGuru).map(({ name, publisherName, items }) => ({
      entityType: "guru" as const,
      entityName: name,
      publisherName,
      items: items.map(l => ({
        content: l.content,
        source: l.source,
        date: new Date(l.createdAt).toLocaleDateString(),
      })),
    })),
    ...Object.values(byPublisher).map(({ name, items }) => ({
      entityType: "publisher" as const,
      entityName: name,
      items: items.map(l => ({
        content: l.content,
        source: l.source,
        date: new Date(l.createdAt).toLocaleDateString(),
      })),
    })),
    ...Object.values(byList).map(({ name, publisherName, items }) => ({
      entityType: "list" as const,
      entityName: name,
      publisherName,
      items: items.map(l => ({
        content: l.content,
        source: l.source,
        date: new Date(l.createdAt).toLocaleDateString(),
      })),
    })),
    ...(general.length > 0
      ? [{
          entityType: "general" as const,
          entityName: "General",
          items: general.map(l => ({
            content: l.content,
            source: l.source,
            date: new Date(l.createdAt).toLocaleDateString(),
          })),
        }]
      : []),
  ];

  let brainData: unknown;
  try {
    const brainRes = await fetch(`${BRAIN_URL}/api/intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": HUB_API_TOKEN },
      body: JSON.stringify({ blocks }),
    });

    if (!brainRes.ok) {
      const err = await brainRes.text();
      // Non-2xx (e.g. 502 when brain-map's git push fails). Do NOT mark appended —
      // the learnings stay eligible and will be retried on the next sync cycle.
      return { pushed: 0, skipped: learnings.length, errors: [`Brain vault error (HTTP ${brainRes.status}): ${err}`] };
    }

    brainData = await brainRes.json();

    // A 200 response is NOT sufficient on its own: brain-map can return HTTP 200
    // with { ok: false } if the append/commit did not actually reach the vault.
    // Only an explicit { ok: true } confirms the blocks landed. Anything else
    // means the push failed silently — leave appendedToBrain=false so we retry.
    if (!brainData || typeof brainData !== "object" || (brainData as { ok?: unknown }).ok !== true) {
      return {
        pushed: 0,
        skipped: learnings.length,
        errors: [`Brain vault reported failure (not { ok: true }): ${JSON.stringify(brainData)}`],
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { pushed: 0, skipped: learnings.length, errors: [`Network error reaching brain vault: ${msg}`] };
  }

  // Mark all successfully-pushed learnings
  const allIds = learnings.map(l => l.id);
  await prisma.learning.updateMany({
    where: { id: { in: allIds } },
    data: { appendedToBrain: true, appendedAt: new Date() },
  });

  console.log(`[BrainExport] Pushed ${allIds.length} learnings to brain vault`, brainData);

  // ── Per-guru live-intel (Brain API `guru-live-intel`) ──────────────────────
  // Batched: one POST per guru, aggregated from this same run's gated byGuru groups.
  // Best-effort/append-only: failures here do NOT unwind the successful blocks push or
  // the appendedToBrain marking above — they are surfaced as non-fatal errors so the
  // overall nightly sync still reports success. The per-guru bullets are idempotent-safe
  // to re-attempt on a future run only via new learnings; we intentionally do not roll
  // back marking, since the canonical `blocks` sync already landed.
  const guruIntel = await pushGuruLiveIntel(byGuru);
  if (guruIntel.posted > 0) {
    console.log(`[BrainExport] Posted guru-live-intel for ${guruIntel.posted} guru(s)`);
  }
  if (guruIntel.errors.length > 0) {
    console.warn(`[BrainExport] guru-live-intel had ${guruIntel.errors.length} error(s):`, guruIntel.errors);
  }

  return { pushed: allIds.length, skipped: 0, errors: guruIntel.errors };
}

// ─── For the GET display endpoint (unchanged from original) ──────────────────

/**
 * Fetch all validated learnings for display in the Export tab (not filtered by appendedToBrain).
 */
export async function fetchAllValidatedLearnings() {
  return prisma.learning.findMany({
    where: {
      status: "VALIDATED",
      source: "AI_EMAIL",
    },
    include: {
      guru: { select: { name: true, publisher: { select: { name: true } } } },
      publisher: { select: { name: true } },
      list: { select: { name: true, publisher: { select: { name: true } } } },
      // Keep the email select identical to fetchEligibleLearnings so both feed the
      // shared groupLearnings() with the same FetchedLearning shape.
      email: { select: { subject: true, receivedAt: true, gmailMessageId: true, emailType: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export { groupLearnings };

// ─── Word overlap helpers (mirrors learnings.ts for corroboration) ────────────

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","has","have","had","be","been","being",
  "and","or","but","in","on","at","to","for","of","with","by","from","as","this",
  "that","these","those","it","its","he","she","they","we","you","i","his","her",
  "their","our","your","my","will","would","could","should","may","might","can",
  "do","does","did","not","no","so","if","then","about","into","up","out","also",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

function wordOverlapSets(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(w => b.has(w)).length;
  return intersection / Math.min(a.size, b.size);
}
