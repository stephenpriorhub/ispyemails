/**
 * Affiliate-seed inbox configuration.
 *
 * Some inboxes are "seeds" planted on affiliate marketers' lists. Affiliate
 * marketers (e.g. MarketBeat) are paid to mail OTHER publishers' offers to
 * their file — they are NOT publishers themselves, and a guru/editor named in
 * the byline does NOT belong to the affiliate (it's whoever's promo they're
 * mailing).
 *
 * Every email received by a seed inbox is force-attributed to the affiliate's
 * publisher + list, and bylined gurus are recorded as "who the promo is for"
 * (on the email) but never linked to the affiliate's list.
 *
 * Keyed by the RECEIVING Gmail account address (lowercased).
 */

export interface AffiliateSeed {
  /** Publisher name to force (created as type AFFILIATE_MARKETER). */
  publisher: string;
  /** List name to force (created as category MARKETING_FILE). */
  list: string;
}

const AFFILIATE_SEEDS: Record<string, AffiliateSeed> = {
  "markusjeat@gmail.com": { publisher: "MarketBeat", list: "MarketBeat" },
};

/** Return the affiliate mapping for a receiving inbox, or null if not a seed. */
export function getAffiliateSeed(accountEmail: string | null | undefined): AffiliateSeed | null {
  if (!accountEmail) return null;
  return AFFILIATE_SEEDS[accountEmail.toLowerCase().trim()] ?? null;
}
