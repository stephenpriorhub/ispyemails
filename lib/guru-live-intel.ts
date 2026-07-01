/**
 * guru-live-intel.ts
 *
 * Pure mapping from an iSpy Learning (+ its email/guru/list relations) to a
 * Brain API `guru-live-intel` item. NO Prisma / fs / network imports, so it is
 * unit-testable in isolation (see scripts/test-guru-intel.mjs) and safe to import
 * from anywhere.
 *
 * The item shape matches brain-map's `GuruLiveIntelItem`
 * (Projects/brain-map/lib/ingest.ts). The Brain API appends these append-only
 * inside the `<!-- ispy:start/end -->` block of Resources/Experts/<Guru>.md.
 */

/** One item in a `guru-live-intel` payload — mirrors brain-map's GuruLiveIntelItem. */
export interface GuruLiveIntelItem {
  date: string;
  publication: string;
  angle: string;
  subjectLine: string;
  tactic: string;
  sourceEmailId: string;
}

/**
 * The subset of a fetched Learning that the mapping actually reads. Kept
 * structural (not tied to Prisma types) so the pure function and its test
 * share one contract.
 */
export interface MappableLearning {
  content: string;
  createdAt: Date | string;
  emailId?: string | null;
  guru?: { name: string; publisher?: { name: string } | null } | null;
  list?: { name: string } | null;
  email?: {
    subject: string;
    receivedAt: Date | string;
    gmailMessageId: string;
    emailType: string;
  } | null;
}

/** ISO YYYY-MM-DD — email receive date, else learning createdAt. */
export function isoDate(l: MappableLearning): string {
  const d = l.email?.receivedAt ?? l.createdAt;
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Map one iSpy Learning → a Brain API `guru-live-intel` item.
 *
 *   date          ← email.receivedAt (fallback: learning.createdAt), as YYYY-MM-DD
 *   publication   ← list name → else guru's publisher name → "Unknown"
 *   angle         ← learning.content (iSpy's extracted "what they're pitching")
 *   subjectLine   ← email.subject
 *   tactic        ← email.emailType (PROMO | LIFT_NOTE | EDITORIAL | …) — observed copy tactic
 *   sourceEmailId ← email.gmailMessageId (fallback: learning.emailId)
 *
 * `guruPublisherName` is the publisher resolved by the caller's grouping; it is
 * preferred over re-reading l.guru.publisher so grouping and mapping agree.
 */
export function toGuruLiveIntelItem(
  l: MappableLearning,
  guruPublisherName?: string,
): GuruLiveIntelItem {
  return {
    date: isoDate(l),
    publication: l.list?.name ?? guruPublisherName ?? l.guru?.publisher?.name ?? "Unknown",
    angle: l.content,
    subjectLine: l.email?.subject ?? "",
    tactic: l.email?.emailType ?? "UNKNOWN",
    sourceEmailId: l.email?.gmailMessageId ?? l.emailId ?? "",
  };
}
