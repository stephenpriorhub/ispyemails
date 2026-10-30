/**
 * Guardrails for list names.
 *
 * A "list" is a newsletter / e-letter (Daily Reckoning, Trade of the Day) — a
 * name that recurs across many sends. It is never a single email's headline.
 *
 * The trap: beehiiv, Substack and MarketBeat set the HTML <title> (and often the
 * first <h1>) to the email's headline, and that headline was being taken as the
 * "masthead". Every send then minted its own one-email list (≈55 junk lists by
 * Oct 2026, almost all FOMO Finance / Super Investors / MarketBeat). Every path
 * that can CREATE a list must pass the candidate through isPlausibleNewListName.
 * Matching an EXISTING list is unaffected.
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ");
}

/**
 * Canonical form for comparing names: lowercase, entities decoded, "&" → "and",
 * leading "The " dropped, ALL punctuation/emoji removed, whitespace collapsed.
 * So "Elon's Super Startup: Phase II" == "Elons Super Startup Phase II" and
 * "The October Million-Dollar Cycle" == "October Million Dollar Cycle".
 */
export function canonListName(s: string): string {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

const PLACEHOLDER_NAMES = new Set([
  "", "blank", "unknown", "unknown list", "author", "null", "none", "n a", "na",
  "newsletter", "email", "untitled", "no subject", "subject",
]);

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";

/** True when `name` is (or is clearly built from) this email's subject line. */
export function looksLikeSubjectLine(name: string, subject: string): boolean {
  const n = canonListName(name);
  const s = canonListName(subject.replace(/^(re|fwd?):\s*/i, ""));
  if (!n) return false;
  if (s && n === s) return true;
  const words = n.split(" ").length;
  // Headline truncated into a title, or title embedded in a longer subject.
  if (s && words >= 4 && (s.includes(n) || n.includes(s))) return true;
  return false;
}

/**
 * Shape-only check — does this read like a headline rather than a masthead,
 * regardless of the subject? Catches titles that differ slightly from the subject
 * (MarketBeat rewrites the subject vs the <title>).
 */
export function looksLikeHeadline(name: string): boolean {
  const raw = decodeEntities(name).trim();
  const words = canonListName(raw).split(" ").filter(Boolean).length;
  if (/[?!]\s*$/.test(raw)) return true;                                  // "Bezos… DOOMED?"
  if (/[—–]|\.\.\.|…/.test(raw)) return true;                             // headline dashes / ellipses
  if (/\$\s?\d|\d+\s?%|\bpercent\b/i.test(raw)) return true;              // "$250,000/Month", "40 percent"
  if (/^\[[^\]]+\]/.test(raw)) return true;                               // "[ACTION] Money Monday"
  if (new RegExp(`\\b(${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}\\b`, "i").test(raw)) return true; // dated issue
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(raw)) return true;
  if (/\bfor (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(raw)) return true;
  if (words > 8) return true;
  return false;
}

/**
 * Gate for MINTING a new list. Existing-list matches don't go through this.
 * Rejects headlines, subject lines, addresses and placeholders.
 */
export function isPlausibleNewListName(name: string | null | undefined, subject: string): name is string {
  if (!name) return false;
  const raw = decodeEntities(name).trim();
  if (raw.length < 3 || raw.length > 60) return false;
  if (raw.includes("@") || /^https?:/i.test(raw)) return false;
  if (PLACEHOLDER_NAMES.has(canonListName(raw))) return false;
  if (looksLikeSubjectLine(raw, subject)) return false;
  if (looksLikeHeadline(raw)) return false;
  return true;
}

/** Clean a name before storing it (decode "&#39;" etc.). */
export function cleanListName(name: string): string {
  return decodeEntities(name).replace(/\s+/g, " ").trim();
}
