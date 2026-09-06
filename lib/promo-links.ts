/**
 * Promo link resolution.
 *
 * Emails don't contain the promo URL — they contain a per-recipient tracking
 * link that hops through 2-6 redirectors before landing on the VSL. This module
 * turns an email body into the *destination* pages, deterministically: parse the
 * anchors, follow every hop, canonicalise what we land on, read the headline off
 * the page. No LLM anywhere in here — a model must never be the source of a URL.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// ─── Link extraction ─────────────────────────────────────────────────────────

/** Hosts that are never a promo destination (assets, social, the sending ESP's own chrome). */
const SKIP_HOSTS = [
  "fonts.googleapis.com", "fonts.gstatic.com", "googletagmanager.com", "google-analytics.com",
  "facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com", "pinterest.com",
  "t.me", "telegram.me", "whatsapp.com", "threads.net", "tiktok.com", "reddit.com",
  "apple.com", "play.google.com", "itunes.apple.com",
];

/** Anything in the URL that marks it as list-management rather than an offer. */
const SKIP_URL_PATTERNS = [
  /unsubscribe/i, /optout/i, /opt-out/i, /manage[-_]?(your)?[-_]?(pref|sub|email)/i,
  /preferences/i, /privacy/i, /\bterms\b/i, /disclaimer/i, /contact[-_]?us/i,
  /email[-_]?policy/i, /whitelist/i, /update[-_]?profile/i, /view[-_]?(in|as)[-_]?browser/i,
  /\/about\b/i, /customer[-_]?service/i, /support@/i, /\.(png|jpe?g|gif|svg|css|js|webp)(\?|$)/i,
];

export function extractCandidateLinks(bodyHtml: string, limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of bodyHtml.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const raw = decodeEntities(m[1].trim());
    if (!/^https?:\/\//i.test(raw)) continue;
    if (SKIP_URL_PATTERNS.some((re) => re.test(raw))) continue;
    let host: string;
    try {
      host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    if (SKIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Redirect resolution ─────────────────────────────────────────────────────

export interface Resolved {
  finalUrl: string;
  status: number;
  html: string | null;
  hops: number;
  error?: string;
}

const META_REFRESH = /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"';]+)/i;
const JS_REDIRECT = /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']{8,})["']/i;

/**
 * Follow the redirect chain to its end. Deliberately tolerant: a 403 from
 * Cloudflare or a 404 from an expired per-recipient link still tells us the
 * destination URL, which is the part we actually need — so we return it either
 * way and only lose the on-page headline.
 */
export async function resolveUrl(
  url: string,
  { maxHops = 10, timeoutMs = 20_000 }: { maxHops?: number; timeoutMs?: number } = {},
): Promise<Resolved> {
  let current = url;
  const visited = new Set<string>();

  for (let hop = 0; hop < maxHops; hop++) {
    if (visited.has(current)) return { finalUrl: current, status: 0, html: null, hops: hop, error: "redirect loop" };
    visited.add(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      return {
        finalUrl: current,
        status: 0,
        html: null,
        hops: hop,
        error: err instanceof Error ? err.message : "fetch failed",
      };
    }
    clearTimeout(timer);

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      try {
        current = new URL(location, current).toString();
      } catch {
        return { finalUrl: current, status: res.status, html: null, hops: hop, error: "bad Location" };
      }
      continue;
    }

    // Terminal response. Non-HTML or an error page: keep the URL, drop the body.
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("html")) {
      return { finalUrl: current, status: res.status, html: null, hops: hop };
    }

    let html: string;
    try {
      html = await res.text();
    } catch {
      return { finalUrl: current, status: res.status, html: null, hops: hop };
    }

    // Client-side redirects are common in these funnels — chase one more hop.
    const head = html.slice(0, 6000);
    const next = head.match(META_REFRESH)?.[1] ?? head.match(JS_REDIRECT)?.[1];
    if (next && !next.startsWith("#")) {
      try {
        const abs = new URL(next.trim(), current).toString();
        if (!visited.has(abs)) {
          current = abs;
          continue;
        }
      } catch {
        /* fall through and treat this page as terminal */
      }
    }

    return { finalUrl: current, status: res.status, html, hops: hop };
  }

  return { finalUrl: current, status: 0, html: null, hops: maxHops, error: "too many redirects" };
}

// ─── Canonicalisation ────────────────────────────────────────────────────────

/**
 * Query keys that vary per send/recipient and must not split one promo into many.
 * Anything NOT listed here is kept, because some params genuinely identify the
 * promo — Porter runs several different promos off /mrln/ separated only by
 * `caid`, so a whitelist approach would collapse them into one.
 */
const NOISE_PARAMS = new Set([
  "transaction_id", "_ef_transaction_id", "transactionid", "clickid", "click_id", "gclid", "fbclid",
  "email", "uid", "userid", "user_id", "subscriberid", "subscriber_id", "recipient", "emailhash",
  "sub1", "sub2", "sub3", "sub4", "sub5", "sub6", "sub7", "sub8", "sub9", "subid", "sub_id",
  "dominoid", "msid", "sid", "sessionid", "session_id", "aid", "hash", "signature", "token",
  "source_id", "sender", "placement", "interstitial", "schemaclick", "subjectlinetest",
  "today", "signed_date", "listname", "list", "date", "sent", "timestamp", "ts",
  "af_sub_siteid", "_bhiiv", "bhcl_id", "returnurl", "redirect", "redirect_url", "url",
  // Affiliate / creative attribution: the same landing page bought through two
  // different affiliates or rotated through two creatives is still one promo.
  "aff", "affid", "aff_id", "affiliate", "affiliate_id", "creative_id", "creativeid", "oid",
  "el", "fn", "ln", "name", "firstname", "lastname", "_tlid", "eid", "oneclick",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_siteid",
  "banner", "scid", "bmmailid", "opt_domain", "opt_mandator", "opt_affiliate",
  "itbl_templateid", "itbl_campaignid", "vid2", "tid", "ef_transaction_id",
  "lead_email", "htrafficsource", "sl", "tnames", "propid", "fids", "category",
  "aff_click_id", "src", "mc_cid", "mc_eid",
]);

/** Values that are plainly per-recipient rather than per-promo. */
const isNoiseValue = (v: string) =>
  v.includes("@") ||
  /^[0-9a-f]{24,}$/i.test(v) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ||
  /^https?:\/\//i.test(v) ||
  /^[A-Za-z0-9+/]{20,}={0,2}$/.test(v) || // base64 blob, usually the recipient
  v.length > 40;

const isNoiseParam = (key: string) => {
  const k = key.toLowerCase();
  return (
    NOISE_PARAMS.has(k) ||
    k.length <= 2 ||            // ?a=622&c=11412&p=c&s2=... — always tracking
    k.startsWith("utm_") ||
    k.startsWith("aff_sub") ||
    k.startsWith("af_sub") ||
    k.startsWith("_x_zm_") ||   // Zoom per-click registration ids
    k.startsWith("mkt_")
  );
};

export function canonicalKey(finalUrl: string): string {
  let u: URL;
  try {
    u = new URL(finalUrl);
  } catch {
    return finalUrl.toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");

  const domino = path.match(/^\/p\/([^/]+)\/[A-Za-z0-9]{6,}$/);
  if (domino) path = `/p/${domino[1]}`;

  const params = [...u.searchParams.entries()]
    .filter(([k, v]) => v !== "" && !isNoiseParam(k) && !isNoiseValue(v))
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
  return `${host}${path || "/"}${query}`;
}

/** Registrable-ish domain, for grouping promos under one advertiser. */
export function rootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  // Handle the common two-part public suffixes we actually see (.co.uk etc).
  const twoPart = /^(co|com|net|org|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.slice(twoPart ? -3 : -2).join(".");
}

// ─── Page reading ────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"');
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const metaContent = (html: string, prop: string): string | null => {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${prop}["']`,
    "i",
  );
  const m = html.match(re) ?? html.match(alt);
  return m ? decodeEntities(m[1]).trim() || null : null;
};

/** Titles that tell us nothing — the brand name, a placeholder, a block page. */
const GENERIC_TITLE = /^(home|index|landing|page|untitled|document|loading|redirecting|just a moment|attention required|access denied|error|404|not found)\b/i;

/** Exit-intent / interstitial copy that sits in the H1 above the real headline. */
const POPUP_HEADLINE = /^(wait|hold on|stop|don'?t go|do ?not leave|don'?t leave|before you go|are you sure|welcome to|congratulations|thank you)\b/i;

export interface PageInfo {
  headline: string | null;
  headlineSource: "PAGE_H1" | "PAGE_OG" | "PAGE_TITLE" | null;
  siteName: string | null;
}

/**
 * Best available headline for the promo, preferring the on-page hero over the
 * tab title (financial VSLs frequently title the tab with just the brand).
 */
export function readPage(html: string | null): PageInfo {
  if (!html) return { headline: null, headlineSource: null, siteName: null };

  const rawSite = metaContent(html, "og:site_name");
  // Plenty of these pages set og:site_name to a bare domain ("wealthyretirement.com"),
  // which is worse than what we derive ourselves — only take it when it reads as a name.
  const siteName = rawSite && !rawSite.includes(".") && rawSite.length <= 60 ? rawSite : null;

  const candidates: [string | null, PageInfo["headlineSource"]][] = [];
  for (const m of html.matchAll(/<h1[^>]*>([\s\S]{0,600}?)<\/h1>/gi)) {
    candidates.push([stripTags(m[1]), "PAGE_H1"]);
  }
  candidates.push([metaContent(html, "og:title"), "PAGE_OG"]);
  const title = html.match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i);
  candidates.push([title ? stripTags(title[1]) : null, "PAGE_TITLE"]);

  for (const [raw, source] of candidates) {
    if (!raw) continue;
    // Drop a trailing " | Brand" / " - Brand" suffix.
    const text = raw.replace(/\s*[|–—]\s*[^|–—]{2,40}$/, "").trim();
    if (text.length < 8 || text.length > 300) continue;
    // Some pages put a whole paragraph in og:title; keep the first sentence.
    if (text.length > 160) {
      const cut = text.slice(0, 160);
      const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
      const trimmed = (stop > 40 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim();
      if (trimmed.length >= 8) return { headline: trimmed, headlineSource: source, siteName };
    }
    if (GENERIC_TITLE.test(text)) continue;
    if (POPUP_HEADLINE.test(text)) continue;
    if (siteName && text.toLowerCase() === siteName.toLowerCase()) continue;
    return { headline: text, headlineSource: source, siteName };
  }

  return { headline: null, headlineSource: null, siteName };
}

/** Human label for an advertiser we have no Publisher record for. */
export function advertiserLabelFromDomain(host: string): string {
  const root = rootDomain(host);
  const name = root.replace(/\.[a-z.]+$/, "");
  return name
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Picking the promo out of an email ───────────────────────────────────────

/** Destination paths that are downstream of, or beside, the promo itself. */
const NOT_A_PROMO_PATH = [
  /unsubscribe/i, /mailing-preferences/i, /preferences/i, /privacy/i, /privpolicy/i, /terms/i, /disclaimer/i,
  /[-_/]order[-_/]/i, /order[-_]?form/i, /\/checkout/i, /\/cart\b/i, /\/upsell/i, /\/thank[-_]?you/i,
  /\/confirm(ation)?\b/i, /\/login\b/i, /\/account\b/i, /\/subscribe\b/i, /\/archive\b/i,
  /\/articles?\//i, /\/blog\//i, /\/contact/i, /\/careers/i, /\/faq\b/i,
  /interstitial/i, /\/optout/i, /opt[-_]?out/i,
  /^\/j\/\d{9,}/, // zoom.us/j/<id> — a meeting invite, not a landing page
];

/**
 * Last line of defence: some list-management pages have innocuous paths and are
 * only identifiable once rendered ("Newsletterverwaltung GeVestor",
 * "MarketBeat Interstitial Page"). Judge them by what the page says it is.
 */
const NOT_A_PROMO_HEADLINE = [
  /unsubscribe/i, /mailing preferences/i, /email preferences/i, /manage (your )?subscription/i,
  /privacy policy/i, /terms of (use|service)/i, /interstitial/i, /newsletterverwaltung/i,
  /preference cent(er|re)/i, /newsletter confirmation/i, /you (have )?been unsubscribed/i,
  /javascript is (disabled|required)/i, /enable javascript/i, /please wait/i,
];

/**
 * Generic hosts that carry someone else's promo — the domain tells us nothing
 * about who is advertising, so attribution has to fall back to the sender.
 */
const PLATFORM_HOSTS = [
  "zoom.us", "docs.google.com", "forms.gle", "eventbrite.com", "gotowebinar.com",
  "demio.com", "webinarjam.com", "everwebinar.com", "crowdcast.io", "youtube.com", "youtu.be",
  "beehiiv.com", "substack.com", "mailchi.mp",
  "infusionsoft.com", "keap.com", "clickfunnels.com", "kartra.com", "activehosted.com", "hubspot.com",
];

export interface Destination {
  url: string;
  canonicalKey: string;
  host: string;
  rootDomain: string;
  status: number;
  isPlatform: boolean;
  headline: string | null;
  headlineSource: PageInfo["headlineSource"];
  siteName: string | null;
}

const isBoilerplateDestination = (url: string) => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (SKIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  return NOT_A_PROMO_PATH.some((re) => re.test(u.pathname + u.search));
};

/**
 * Resolve an email's links and return the promo destinations, best first.
 *
 * Stops early once two solid destinations on different domains have been found —
 * a promo email is selling one thing, and every extra hop is a live HTTP request.
 */
export async function resolveEmailDestinations(
  bodyHtml: string,
  {
    maxResolves = 8,
    excludeRootDomains = [],
    timeoutMs = 20_000,
  }: { maxResolves?: number; excludeRootDomains?: string[]; timeoutMs?: number } = {},
): Promise<Destination[]> {
  const candidates = extractCandidateLinks(bodyHtml, maxResolves + 4);
  const excluded = new Set(excludeRootDomains.map((d) => d.toLowerCase()));
  const byKey = new Map<string, Destination>();
  const seenRoots = new Set<string>();
  let resolves = 0;

  for (const candidate of candidates) {
    if (resolves >= maxResolves || seenRoots.size >= 2) break;
    resolves++;

    const res = await resolveUrl(candidate, { timeoutMs });
    if (isBoilerplateDestination(res.finalUrl)) continue;

    let host: string;
    try {
      host = new URL(res.finalUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    const root = rootDomain(host);
    if (excluded.has(root)) continue;

    const key = canonicalKey(res.finalUrl);
    if (byKey.has(key)) continue;

    const page = readPage(res.html);
    if (page.headline && NOT_A_PROMO_HEADLINE.some((re) => re.test(page.headline!))) continue;
    // A root-path landing whose headline is just the brand name is the header
    // logo link, not something they are selling.
    const isBareHome = new URL(res.finalUrl).pathname.replace(/\/+$/, "") === "";
    const brandish = advertiserLabelFromDomain(host).toLowerCase().replace(/[^a-z0-9]/g, "");
    const headlineish = (page.headline ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    // "The Oxford Club - Home" on oxfordclub.com/ is the masthead link.
    if (isBareHome && (!page.headline || (brandish.length > 3 && headlineish.includes(brandish)))) continue;
    byKey.set(key, {
      url: res.finalUrl,
      canonicalKey: key,
      host,
      rootDomain: root,
      status: res.status,
      isPlatform: PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`)),
      headline: page.headline,
      headlineSource: page.headlineSource,
      siteName: page.siteName,
    });
    seenRoots.add(root);
  }

  // One destination per root domain — an email that links the VSL and its order
  // form is still mailing one promo.
  const best = new Map<string, Destination>();
  for (const d of byKey.values()) {
    const incumbent = best.get(d.rootDomain);
    if (!incumbent || score(d) > score(incumbent)) best.set(d.rootDomain, d);
  }
  return [...best.values()].sort((a, b) => score(b) - score(a));
}

function score(d: Destination): number {
  let s = 0;
  if (d.headline) s += 4;
  if (d.headlineSource === "PAGE_H1" || d.headlineSource === "PAGE_OG") s += 2;
  if (d.status === 200) s += 2;
  if (d.status === 403) s += 1; // Cloudflare-gated, but the URL is still good
  if (d.status === 0) s -= 3;   // never loaded — keep only if nothing better exists
  if (!d.isPlatform) s += 1;
  // Shallow paths are landing pages; deep ones are usually funnel steps.
  s -= Math.max(0, d.canonicalKey.split("/").length - 3);
  return s;
}
