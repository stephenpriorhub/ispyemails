import { prisma } from "./prisma";
import { logAILearning } from "./learnings";
import { getAffiliateSeed } from "./affiliate-seeds";

// ─── Pass 2 types ─────────────────────────────────────────────────────────────

interface DeepAnalysisInput {
  id: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  emailType: string;
  publisherName: string | null;
  listName: string | null;
  guruName: string | null;
  receivedAt: Date | string;
}

interface DeepAnalysisResult {
  trade_recommendation: {
    present: boolean;
    ticker: string | null;
    direction: string | null;
    instrument: string | null;
    strike: string | null;
    expiry: string | null;
    thesis_summary: string | null;
  };
  offer: {
    product_name: string | null;
    price_point: string | null;
    original_price: string | null;
    discount_framing: string | null;
    guarantee: string | null;
    urgency_type: string;
    urgency_copy: string | null;
    free_bonus_items: string[];
    call_to_action: string | null;
    landing_page_url: string | null;
  };
  marketing_tactics: {
    lead_type: string | null;
    hook_summary: string | null;
    hook_quote: string | null;
    narrative_frame: string | null;
    credibility_signals: string[];
    lift_note_promoter: string | null;
    lift_note_subject: string | null;
  };
  compliance_signals: {
    return_claims: string[];
    win_rate_claims: string[];
    testimonials_with_figures: string[];
    guarantee_language: string | null;
    risk_disclosure_present: boolean;
    compliance_risk_level: string;
    compliance_notes: string | null;
  };
  editorial_intel: {
    market_thesis: string | null;
    featured_tickers: string[];
    sector_focus: string | null;
    timeframe: string;
    contrarian_or_consensus: string;
    key_argument: string | null;
  };
  competitive_positioning: {
    mta_overlap: string;
    overlap_notes: string | null;
    notable_for_team: string | null;
  };
}

const DEEP_ANALYSIS_PROMPT: Record<string, string> = {
  PROMO: `You are a senior competitive intelligence analyst for Monument Traders Alliance (MTA), a financial newsletter publisher.
Analyze this PROMOTIONAL email from a competitor and extract intelligence in JSON format.
Focus on: what they're selling, how they're selling it, compliance red flags, and how it compares to MTA's products.

MTA context: Bryan Bottarelli (options/CBOE floor, WAR/PMK/WNM/TPU), Karim Rahemtulla (LEAPs/put-selling, WAR/UnboundF), Nate Bear (TPS system, $37k→$2.7M, PSU/DPL).`,

  LIFT_NOTE: `You are a senior competitive intelligence analyst for Monument Traders Alliance (MTA), a financial newsletter publisher.
Analyze this LIFT NOTE (affiliate promotion email) and extract intelligence in JSON format.
Focus on: who is being promoted, the promotional tactics used, and any compliance issues.

MTA context: Bryan Bottarelli (options/CBOE floor, WAR/PMK/WNM/TPU), Karim Rahemtulla (LEAPs/put-selling, WAR/UnboundF), Nate Bear (TPS system, $37k→$2.7M, PSU/DPL).`,

  EDITORIAL: `You are a senior competitive intelligence analyst for Monument Traders Alliance (MTA), a financial newsletter publisher.
Analyze this EDITORIAL email and extract intelligence in JSON format.
Focus on: the market thesis, specific trade ideas, editorial positioning, and how the content compares to MTA's approach.

MTA context: Bryan Bottarelli (options/CBOE floor, WAR/PMK/WNM/TPU), Karim Rahemtulla (LEAPs/put-selling, WAR/UnboundF), Nate Bear (TPS system, $37k→$2.7M, PSU/DPL).`,
};

/**
 * Pass 2 — Deep analysis using Claude Sonnet.
 * Fires after Pass 1 for PROMO, LIFT_NOTE, and EDITORIAL emails only.
 * Saves result to EmailAnalysis table. Never throws — logs and returns null on failure.
 */
export async function runDeepAnalysis(input: DeepAnalysisInput): Promise<DeepAnalysisResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[DeepAnalysis] No ANTHROPIC_API_KEY — skipping");
    return null;
  }

  const allowedTypes = ["PROMO", "LIFT_NOTE", "EDITORIAL"];
  if (!allowedTypes.includes(input.emailType)) return null;

  // Truncate body to 8,000 chars
  const rawBody = input.bodyText ?? (input.bodyHtml ? input.bodyHtml.replace(/<[^>]+>/g, " ") : "");
  const cleanBody = rawBody.replace(/\s+/g, " ").replace(/&#\d+;/g, " ").trim().substring(0, 8000);

  const systemPrompt = DEEP_ANALYSIS_PROMPT[input.emailType] ?? DEEP_ANALYSIS_PROMPT.PROMO;

  const userPrompt = `PUBLISHER: ${input.publisherName ?? "Unknown"}
LIST: ${input.listName ?? "Unknown"}
GURU/EDITOR: ${input.guruName ?? "Unknown"}
SUBJECT: ${input.subject}
DATE: ${input.receivedAt}
EMAIL TYPE: ${input.emailType}

BODY:
${cleanBody}

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "trade_recommendation": { "present": false, "ticker": null, "direction": null, "instrument": null, "strike": null, "expiry": null, "thesis_summary": null },
  "offer": { "product_name": null, "price_point": null, "original_price": null, "discount_framing": null, "guarantee": null, "urgency_type": "none", "urgency_copy": null, "free_bonus_items": [], "call_to_action": null, "landing_page_url": null },
  "marketing_tactics": { "lead_type": null, "hook_summary": null, "hook_quote": null, "narrative_frame": null, "credibility_signals": [], "lift_note_promoter": null, "lift_note_subject": null },
  "compliance_signals": { "return_claims": [], "win_rate_claims": [], "testimonials_with_figures": [], "guarantee_language": null, "risk_disclosure_present": false, "compliance_risk_level": "NONE", "compliance_notes": null },
  "editorial_intel": { "market_thesis": null, "featured_tickers": [], "sector_focus": null, "timeframe": "unspecified", "contrarian_or_consensus": "neutral", "key_argument": null },
  "competitive_positioning": { "mta_overlap": "LOW", "overlap_notes": null, "notable_for_team": null }
}

compliance_risk_level must be one of: HIGH, MEDIUM, LOW, NONE
mta_overlap must be one of: HIGH, MEDIUM, LOW
urgency_type examples: none, deadline, countdown, scarcity, event-driven`;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type from Sonnet");

    const jsonMatch = content.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Sonnet response");

    const result: DeepAnalysisResult = JSON.parse(jsonMatch[0]);

    const complianceRisk = result.compliance_signals?.compliance_risk_level ?? "NONE";
    const mtaOverlap = result.competitive_positioning?.mta_overlap ?? "LOW";
    const notableFor = result.competitive_positioning?.notable_for_team ?? null;

    // Upsert so re-analysis overwrites the previous record
    await prisma.emailAnalysis.upsert({
      where: { emailId: input.id },
      update: {
        analysisType: input.emailType,
        rawJson: result as object,
        complianceRisk,
        mtaOverlap,
        notableFor,
        modelUsed: "claude-sonnet-4-5",
        updatedAt: new Date(),
      },
      create: {
        emailId: input.id,
        analysisType: input.emailType,
        rawJson: result as object,
        complianceRisk,
        mtaOverlap,
        notableFor,
        modelUsed: "claude-sonnet-4-5",
      },
    });

    console.log(`[DeepAnalysis] ${input.subject.substring(0, 50)} | risk:${complianceRisk} | overlap:${mtaOverlap}`);
    return result;
  } catch (err) {
    console.error(`[DeepAnalysis] Failed [${input.id}]:`, err);
    return null;
  }
}

/**
 * Extract list name from subject/from-address before AI runs.
 * These patterns are highly reliable — no confidence threshold needed.
 *
 * Examples:
 *   "Welcome to Altucher Confidential" → "Altucher Confidential"
 *   "Welcome to the Daily Reckoning Family" → "Daily Reckoning"
 *   AltucherConfidential@mb.paradigmpressgroup.com → "Altucher Confidential"
 *   rude@mb.paradigmpressgroup.com → null (ambiguous)
 */
/**
 * Hardcoded lookup table for from-addresses whose local parts are too short,
 * lowercase-only, or otherwise ambiguous for the CamelCase heuristic.
 * Key = full from-address (lowercased). Value = list name.
 *
 * Add entries here whenever a newsletter's sending address doesn't match
 * the CamelCase pattern but the list name is known.
 */
const KNOWN_ADDRESS_TO_LIST: Record<string, string> = {
  // Rude Awakening: sent from rude@mb.paradigmpressgroup.com
  // This is a Paradigm Press editorial, NOT a publisher name.
  "rude@mb.paradigmpressgroup.com": "Rude Awakening",
};

/**
 * Hardcoded publisher overrides for known sending addresses.
 * Prevents the AI from inventing a new publisher when the address is ambiguous.
 * Key = from-address domain or full address. Value = publisher name hint for AI.
 */
const KNOWN_ADDRESS_PUBLISHER_HINT: Record<string, string> = {
  "mb.paradigmpressgroup.com": "Paradigm Press",
};

function extractListFromSignals(subject: string, fromEmail: string, fromName = ""): string | null {
  const subjectLower = subject.toLowerCase().trim();
  const fromNameLower = fromName.toLowerCase();

  // ── Multi-list sender disambiguation — highest priority ──
  // Some senders use ONE address for TWO distinct editorial lists. The CamelCase
  // address derivation below can't tell them apart, so we route on the strongest
  // deterministic signals (from-name, then subject) BEFORE anything else.
  //
  // Monument Traders Alliance "Trade of the Day" sends from a single address but
  // runs a separate near-daily "Trade of the Day Wakeup Watchlist" product. The
  // reliable discriminator is the from-name ("Trade of the Day Wake-Up Watchlist"
  // vs plain "Trade of the Day"); the subject occasionally carries it too.
  if (fromEmail.toLowerCase() === "tradeoftheday@mb.mtatradeoftheday.com") {
    const watchlistSignal = /wake[\s-]?up|watchlist/i;
    if (watchlistSignal.test(fromNameLower) || watchlistSignal.test(subjectLower)) {
      return "Trade of the Day Wakeup Watchlist";
    }
    return "Trade of the Day";
  }

  // ── Hardcoded lookup — catches ambiguous addresses ──
  const knownList = KNOWN_ADDRESS_TO_LIST[fromEmail.toLowerCase()];
  if (knownList) return knownList;

  // Pattern: "Welcome to [List Name]" or "Welcome to the [List Name]"
  const welcomeMatch = subject.match(/^welcome\s+to\s+(?:the\s+)?(.+?)(?:\s+(?:family|newsletter|community|daily|weekly|!|🎉).*)?$/i);
  if (welcomeMatch) {
    const candidate = welcomeMatch[1].trim().replace(/[!🎉]+$/, "").trim();
    if (candidate.length > 2 && candidate.length < 60) return candidate;
  }

  // Pattern: "You're in! Welcome to [List Name]"
  const youreInMatch = subject.match(/welcome\s+to\s+(?:the\s+)?([A-Z][^!?.,]+)/i);
  if (youreInMatch && !subjectLower.startsWith("re:")) {
    const candidate = youreInMatch[1].trim();
    if (candidate.length > 2 && candidate.length < 60) return candidate;
  }

  // Pattern: from-address local part looks like a newsletter name
  // e.g. AltucherConfidential@mb.paradigmpressgroup.com → "Altucher Confidential"
  // e.g. TradeoftheDay@mb.mtatradeoftheday.com → "Trade of the Day"
  const localPart = fromEmail.split("@")[0] ?? "";
  if (localPart.length > 4 && localPart.length < 40 && /^[A-Z]/.test(localPart)) {
    // Convert CamelCase to spaced: "AltucherConfidential" → "Altucher Confidential"
    const spaced = localPart
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .trim();
    // Only use if it looks like a real name (2+ words or recognizable)
    if (spaced.includes(" ") && spaced.length > 5) return spaced;
  }

  return null;
}

interface AnalysisResult {
  publisher: string | null;
  publisherConfidence: number;
  list: string | null;          // newsletter name (masthead)
  listConfidence: number;
  gurus: string[];              // editor/author names detected
  emailType: "LIFT_NOTE" | "EDITORIAL" | "PROMO" | "WELCOME" | "UNKNOWN";
  topics: string[];
  offer: { url: string | null; promise: string | null; ticker: string | null };
  summary: string;
  learnings: { text: string; category: "GURU" | "PUBLISHER" | "LIST" | "TOPIC" | "GENERAL" }[];
}

/**
 * Ask Claude to identify the publisher from from-address + subject + body snippet.
 * Returns a suggested publisher name, or null on failure.
 */
async function identifyPublisherViaClaude(
  fromEmail: string,
  subject: string,
  bodySnippet: string
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 60,
      messages: [{
        role: "user",
        content: `Financial newsletter email.
FROM: ${fromEmail}
SUBJECT: ${subject}
BODY SNIPPET: ${bodySnippet.substring(0, 500)}

Who is the PUBLISHER COMPANY that sent this? (e.g. "Paradigm Press", "Stansberry Research", "Oxford Club").
Reply with ONLY the publisher name. If totally unknown, reply with the domain slug (e.g. "paradigmpressgroup.com" → "Paradigm Press Group").`,
      }],
    });
    const reply = (msg.content[0] as { text: string }).text.trim();
    if (reply && reply.length < 80 && !reply.includes("\n")) return reply;
  } catch { /* ignore */ }
  return null;
}

/**
 * Ask Claude to assign topics from the standard topic list.
 */
async function assignTopicsViaClaude(
  subject: string,
  bodySnippet: string,
  availableTopics: string[]
): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `Financial newsletter email.
SUBJECT: ${subject}
BODY SNIPPET: ${bodySnippet.substring(0, 500)}

AVAILABLE TOPICS: ${availableTopics.join(", ")}

Assign 1–3 topics from the list above that best describe this email.
Reply with ONLY a JSON array of topic names, e.g. ["options trading","markets"]. No other text.`,
      }],
    });
    const text = (msg.content[0] as { text: string }).text.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Ask Claude to suggest a list name given publisher context.
 */
async function suggestListViaClaude(
  fromEmail: string,
  fromName: string,
  subject: string,
  bodySnippet: string,
  knownLists: string[]
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 60,
      messages: [{
        role: "user",
        content: `Financial newsletter email.
FROM NAME: ${fromName}
FROM EMAIL: ${fromEmail}
SUBJECT: ${subject}
BODY SNIPPET: ${bodySnippet.substring(0, 500)}
KNOWN LISTS FOR THIS PUBLISHER: ${knownLists.join(", ") || "none"}

What is the newsletter/list name? If it matches a known list exactly, use that name.
Reply with ONLY the name (e.g. "Daily Reckoning"). If you cannot determine it, reply NULL.`,
      }],
    });
    const reply = (msg.content[0] as { text: string }).text.trim();
    if (reply && reply !== "NULL" && reply.length < 80 && !reply.includes("\n")) return reply;
  } catch { /* ignore */ }
  return null;
}

/**
 * Lightweight list-name-only extraction. Used by the "Fix Missing Lists" endpoint.
 * Tries pre-processor first, then HTML title tag, then a quick Claude call.
 * Does NOT run full analysis — no topics, gurus, publishers.
 */
export async function extractListForEmail(
  subject: string,
  fromEmail: string,
  bodyHtml: string | null,
  fromName = ""
): Promise<string | null> {
  // 1. Pre-processor (subject pattern + from-address + from-name)
  const fromPreProcessor = extractListFromSignals(subject, fromEmail, fromName);
  if (fromPreProcessor) return fromPreProcessor;

  // 2. HTML <title> tag
  const html = bodyHtml ?? "";
  const titleTag = html.substring(0, 2000).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    const t = titleTag[1].trim().replace(/\s+/g, " ");
    if (t.length > 2 && t.length < 80 && !t.toLowerCase().includes("<!")) return t;
  }

  // 3. Image alt text in first 3000 chars
  const mastheadSignals = extractMastheadSignals(html);
  const imgAlt = mastheadSignals.match(/Image alt: "([^"]+)"/)?.[1];
  if (imgAlt) return imgAlt;

  // 4. Quick Claude call with just the key signals
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `Financial newsletter email.
FROM: ${fromEmail}
SUBJECT: ${subject}
MASTHEAD SIGNALS: ${mastheadSignals || "none"}
BODY START: ${(bodyHtml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").substring(0, 1000)}

What is the newsletter/list name? Reply with ONLY the name (e.g. "Daily Reckoning", "Altucher Confidential").
If you cannot determine it, reply with the word NULL.`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 50,
      messages: [{ role: "user", content: prompt }],
    });
    const reply = (msg.content[0] as { text: string }).text.trim();
    if (reply && reply !== "NULL" && reply.length < 80 && !reply.includes("\n")) return reply;
  } catch { /* ignore */ }

  return null;
}

/**
 * Extract newsletter name signals from the first ~3000 chars of email HTML.
 * Looks at: image alt text, h1/h2 headings, title attributes.
 * These often contain the masthead newsletter name.
 */
function extractMastheadSignals(html: string): string {
  const top = html.substring(0, 6000);
  const signals: string[] = [];

  // 1. HTML <title> tag — most reliable, always in the <head>
  const titleTag = top.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    const t = titleTag[1].trim().replace(/\s+/g, " ");
    if (t.length > 2 && t.length < 80 && !t.toLowerCase().includes("<!")) {
      signals.push(`Email title: "${t}"`);
    }
  }

  // 2. Image alt text (mastheads are usually the first images)
  const imgAlts = [...top.matchAll(/\balt=["']([^"']{3,60})["']/gi)];
  const skipAlts = ["logo", "banner", "header", "image", "photo", "unsubscribe", "view", "spacer", "pixel"];
  for (const match of imgAlts.slice(0, 8)) {
    const alt = match[1].trim();
    if (!skipAlts.some(g => alt.toLowerCase().includes(g))) {
      signals.push(`Image alt: "${alt}"`);
    }
  }

  // 3. H1/H2 heading text
  const headings = [...top.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)];
  for (const match of headings.slice(0, 3)) {
    const text = match[1].replace(/<[^>]+>/g, "").replace(/&[a-z#\d]+;/gi, " ").trim();
    if (text.length > 2 && text.length < 80) signals.push(`Heading: "${text}"`);
  }

  // 4. Title attributes on elements (e.g. <img title="Altucher Confidential">)
  const titleAttrs = [...top.matchAll(/\btitle=["']([A-Z][^"']{3,50})["']/gi)];
  for (const match of titleAttrs.slice(0, 3)) {
    signals.push(`Title attr: "${match[1].trim()}"`);
  }

  return signals.length > 0 ? signals.join(" | ") : "";
}

/** Upsert an affiliate-marketer publisher (e.g. MarketBeat) by name, forcing type + confirmed. */
async function upsertAffiliatePublisher(name: string): Promise<string> {
  const found = await prisma.publisher.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (found) {
    if (found.type !== "AFFILIATE_MARKETER" || !found.isConfirmed) {
      await prisma.publisher.update({ where: { id: found.id }, data: { type: "AFFILIATE_MARKETER", isConfirmed: true } });
    }
    return found.id;
  }
  const created = await prisma.publisher.create({
    data: { name, type: "AFFILIATE_MARKETER", isConfirmed: true, domains: [], knownFromAddresses: [] },
  });
  return created.id;
}

/** Upsert the affiliate's marketing-file list by name, forcing category + publisher. */
async function upsertAffiliateList(name: string, publisherId: string | null): Promise<string | null> {
  const found = await prisma.list.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (found) {
    const data: { publisherId?: string; category?: "MARKETING_FILE" } = {};
    if (publisherId && found.publisherId !== publisherId) data.publisherId = publisherId;
    if (found.category !== "MARKETING_FILE") data.category = "MARKETING_FILE";
    if (Object.keys(data).length) await prisma.list.update({ where: { id: found.id }, data });
    return found.id;
  }
  const created = await prisma.list.create({
    data: { name, publisherId, category: "MARKETING_FILE", isIgnored: false, autoCreated: false },
  });
  return created.id;
}

export async function analyzeEmail(
  emailId: string,
  subject: string,
  fromName: string,
  fromEmail: string,
  bodyText: string | null,
  bodyHtml: string | null,
  accountEmail?: string | null
): Promise<void> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const [publishers, lists, gurus, existingTopics, ignoredTopics, ignoredGurus, secondaryVoices, validatedLearnings] = await Promise.all([
    prisma.publisher.findMany({ select: { id: true, name: true, domains: true, knownFromAddresses: true, type: true } }),
    prisma.list.findMany({ where: { isIgnored: false }, select: { id: true, name: true, publisherId: true, synonyms: true } }),
    prisma.guru.findMany({ where: { isIgnored: false }, select: { id: true, name: true, isSecondaryVoice: true } }),
    prisma.topic.findMany({ where: { isIgnored: false }, select: { name: true, synonyms: true } }),
    prisma.topic.findMany({ where: { isIgnored: true }, select: { name: true, synonyms: true } }),
    prisma.guru.findMany({ where: { isIgnored: true }, select: { name: true } }),
    prisma.secondaryVoiceGuru.findMany({
      include: { secondaryVoice: { select: { id: true, name: true } }, primaryGuru: { select: { id: true, name: true } } },
    }),
    // Validated learnings feed back into the AI as contextual knowledge
    prisma.learning.findMany({
      where: { status: "VALIDATED" },
      select: { content: true, category: true },
      orderBy: { createdAt: "desc" },
      take: 50, // cap to keep prompt size manageable
    }),
  ]);

  // Build a map: secondary voice name → primary guru ids
  const secondaryToPrimary = new Map<string, string[]>();
  for (const sv of secondaryVoices) {
    const key = sv.secondaryVoice.name.toLowerCase();
    if (!secondaryToPrimary.has(key)) secondaryToPrimary.set(key, []);
    secondaryToPrimary.get(key)!.push(sv.primaryGuruId);
  }

  const rawBody = bodyText ?? (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, " ") : "");
  const cleanBody = rawBody.replace(/\s+/g, " ").replace(/&#\d+;/g, " ").trim().substring(0, 4000);

  // Extract masthead signals from HTML: image alt text + heading tags
  // These often contain the newsletter name even when plain text doesn't
  const mastheadContext = bodyHtml ? extractMastheadSignals(bodyHtml) : "";

  const ignoredTopicNames = new Set([
    ...ignoredTopics.flatMap(t => [t.name.toLowerCase(), ...t.synonyms.map(s => s.toLowerCase())]),
  ]);
  const ignoredGuruNames = new Set(ignoredGurus.map(g => g.name.toLowerCase()));

  const topicList = existingTopics
    .map(t => t.synonyms.length > 0 ? `${t.name} (also: ${t.synonyms.join(", ")})` : t.name)
    .join(", ");

  // ── Classification hints for known ambiguous addresses ──
  const emailDomainForHint = fromEmail.toLowerCase().split("@")[1] ?? "";
  const publisherHint = KNOWN_ADDRESS_PUBLISHER_HINT[fromEmail.toLowerCase()] ?? KNOWN_ADDRESS_PUBLISHER_HINT[emailDomainForHint] ?? null;
  const listHintFromTable = KNOWN_ADDRESS_TO_LIST[fromEmail.toLowerCase()] ?? null;
  const classificationHints: string[] = [];
  if (publisherHint) classificationHints.push(`PUBLISHER HINT: This email is from "${publisherHint}" — use this publisher name exactly.`);
  if (listHintFromTable) classificationHints.push(`LIST HINT: This email belongs to the newsletter "${listHintFromTable}" — use this list name exactly.`);

  // ── Affiliate seed: this inbox only receives mail from an affiliate marketer ──
  const affiliateSeed = getAffiliateSeed(accountEmail);
  if (affiliateSeed) {
    classificationHints.push(
      `AFFILIATE SEND: This email was received via an affiliate-marketer seed inbox for "${affiliateSeed.publisher}". ${affiliateSeed.publisher} is a paid affiliate that mails OTHER publishers' offers to its list — it is NOT the originating publisher. Identify the PROMOTED editor/guru and product in "gurus" and "offer" (i.e. whose promo is being mailed), NOT ${affiliateSeed.publisher}. Do not list ${affiliateSeed.publisher} as a guru.`
    );
  }

  const prompt = `You are an expert analyst of financial newsletter emails in the direct-response publishing industry.
Analyze this email and return ONLY valid JSON — no markdown, no explanation.
${classificationHints.length > 0 ? "\n" + classificationHints.join("\n") + "\n" : ""}
FROM: ${fromName || fromEmail} <${fromEmail}>
SUBJECT: ${subject}
MASTHEAD SIGNALS (image alt text, headings from top of email — newsletter name often here):
${mastheadContext || "None detected"}

BODY: ${cleanBody}

KNOWN PUBLISHERS: ${publishers.map(p => `${p.name} (${p.domains.join(", ")}) [${p.type}]`).join(" | ") || "None"}
KNOWN NEWSLETTERS/LISTS: ${lists.map(l => l.name).join(", ") || "None"}
KNOWN PRIMARY EDITORS/GURUS: ${gurus.filter(g => !g.isSecondaryVoice).map(g => g.name).join(", ") || "None"}
SECONDARY VOICES (contributors/managing editors — NOT primary gurus, do not tag as main guru): ${gurus.filter(g => g.isSecondaryVoice).map(g => g.name).join(", ") || "None"}
EXISTING TOPICS (reuse): ${topicList || "None"}
IGNORED TOPICS (never use): ${[...ignoredTopicNames].join(", ") || "None"}
IGNORED GURUS (never use): ${[...ignoredGuruNames].join(", ") || "None"}
VALIDATED INTELLIGENCE (facts confirmed by the user — use these to inform your analysis):
${validatedLearnings.length > 0 ? validatedLearnings.map(l => `- [${l.category}] ${l.content}`).join("\n") : "None yet"}

Return ONLY this JSON:
{
  "publisher": "Publisher name from list or null",
  "publisherConfidence": 0.0,
  "list": "Newsletter/list name — check MASTHEAD SIGNALS first (image alts/headings above), then subject, then body. e.g. Image:'ALTUCHER CONFIDENTIAL' → 'Altucher Confidential'",
  "listConfidence": 0.0,
  "gurus": ["Editor or author names found in the email"],
  "emailType": "LIFT_NOTE|EDITORIAL|PROMO|WELCOME|UNKNOWN",
  "topics": ["topic1", "topic2"],
  "offer": { "url": "https://... or null", "promise": "pitch or null", "ticker": "TICK or null" },
  "summary": "2-3 sentence summary of what this email is about.",
  "learnings": [
    { "text": "Significant insight about a guru, publisher, or list. Only include if genuinely notable.", "category": "GURU|PUBLISHER|LIST|TOPIC|GENERAL" }
  ]
}

LEARNING RULES — only include learnings that are SIGNIFICANT and NOVEL:
- Good: "Jim Rickards launched a new gold-focused service", "Tim Sykes partnered with Jon Najarian", "Daily Reckoning added crypto coverage"
- Good: "James Rickards appears to be the same person as Jim Rickards based on content similarity"
- Bad: generic facts, obvious things, repeated info, basic email classification
- Max 2 learnings per email. Empty array if nothing significant.

DEFINITIONS:
- list: The NEWSLETTER NAME shown in the masthead/header (e.g. "Daily Reckoning", "Stansberry Digest"). Distinct from the publisher company.
- gurus: Names of editors, authors, or analysts who wrote or are featured. Look for "Editor" bylines, "From the desk of", signatures.
- LIFT_NOTE: Promotes ANOTHER publisher's product (affiliate). Key: "my friend", "fellow investor", promotes someone else.
- EDITORIAL: Investment analysis, market commentary, stock picks from the publisher themselves.
- PROMO: Direct sales for their OWN paid subscription.
- WELCOME: Onboarding/confirmation email.
- topics: Max 4. Be specific. Reuse existing topics when they fit.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");
    const jsonMatch = content.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in response`);
    const result: AnalysisResult = JSON.parse(jsonMatch[0]);

    // ── Fallback: if AI returned no list, try extractListForEmail (pre-processor + HTML + mini-Claude) ──
    if (!result.list || result.list.trim() === "") {
      const fallbackList = await extractListForEmail(subject, fromEmail, bodyHtml, fromName);
      if (fallbackList) {
        console.log(`  ↳ fallback list extraction: "${fallbackList}"`);
        result.list = fallbackList;
        if (result.listConfidence === 0) result.listConfidence = 0.5;
      }
    }

    // ── Fallback: if AI returned no topics, try keyword heuristics then Claude then catch-all ──
    if (!result.topics || result.topics.length === 0) {
      const subjectLower = subject.toLowerCase();
      const keywordTopics: string[] = [];
      if (/crypto|bitcoin|btc|ethereum|eth|altcoin/i.test(subjectLower)) keywordTopics.push("crypto");
      else if (/gold|silver|precious metal|commodity|commodities/i.test(subjectLower)) keywordTopics.push("commodities");
      else if (/options|call|put|strike|expiry|theta|delta/i.test(subjectLower)) keywordTopics.push("options trading");
      else if (/dividend|income|yield|reit/i.test(subjectLower)) keywordTopics.push("dividend investing");
      else if (/ai|artificial intelligence|machine learning/i.test(subjectLower)) keywordTopics.push("technology");
      else if (/biotech|pharmaceutical|fda|drug|clinical/i.test(subjectLower)) keywordTopics.push("biotech");
      else if (/energy|oil|gas|solar|wind|renewable/i.test(subjectLower)) keywordTopics.push("energy");
      else if (/forex|currency|dollar|yen|euro/i.test(subjectLower)) keywordTopics.push("forex");
      else if (/real estate|housing|mortgage/i.test(subjectLower)) keywordTopics.push("real estate");

      if (keywordTopics.length > 0) {
        result.topics = keywordTopics;
        console.log(`  ↳ keyword fallback topics: ${keywordTopics.join(", ")}`);
      } else {
        // Ask Claude with the full topic list before falling back to "markets"
        const claudeTopics = await assignTopicsViaClaude(
          subject,
          cleanBody,
          existingTopics.map(t => t.name)
        );
        if (claudeTopics.length > 0) {
          result.topics = claudeTopics;
          console.log(`  ↳ Claude fallback topics: ${claudeTopics.join(", ")}`);
        } else {
          result.topics = ["markets"]; // universal catch-all
          console.log(`  ↳ catch-all topic assigned: markets`);
        }
      }
    }

    // ── Affiliate seed override: force publisher + list to the affiliate ──
    const isAffiliateSeed = affiliateSeed !== null;

    // ── Publisher matching — must always resolve ──
    const emailDomain = (fromEmail.toLowerCase().split("@")[1] ?? "");
    let publisherId: string | null = null;

    if (isAffiliateSeed) {
      publisherId = await upsertAffiliatePublisher(affiliateSeed!.publisher);
    } else {
    const exactMatch = publishers.find(p => p.knownFromAddresses.includes(fromEmail));
    if (exactMatch) {
      publisherId = exactMatch.id;
    } else {
      const domainMatch = publishers.find(p =>
        p.domains.some(d => { const pd = d.toLowerCase(); return emailDomain === pd || emailDomain.endsWith("." + pd); })
      );
      if (domainMatch) {
        publisherId = domainMatch.id;
        if (!domainMatch.knownFromAddresses.includes(fromEmail)) {
          await prisma.publisher.update({ where: { id: domainMatch.id }, data: { knownFromAddresses: { push: fromEmail } } });
        }
      } else {
        // No domain match — use AI result if confident, otherwise ask Claude specifically
        let pubName = (result.publisher && result.publisherConfidence >= 0.5) ? result.publisher : null;
        if (!pubName) {
          pubName = await identifyPublisherViaClaude(fromEmail, subject, cleanBody);
        }
        if (!pubName) {
          // Last resort: derive name from domain slug
          pubName = emailDomain
            .replace(/^(mb|info|mail|news|newsletter)\./i, "")
            .split(".")[0]
            .replace(/-/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim() || emailDomain;
        }
        // Upsert to avoid duplicates on race conditions
        try {
          const newPub = await prisma.publisher.create({
            data: { name: pubName, type: "UNKNOWN", domains: emailDomain ? [emailDomain] : [], knownFromAddresses: [fromEmail], isConfirmed: false },
          });
          publisherId = newPub.id;
        } catch {
          // Publisher with that name already exists (race) — find it
          const found = await prisma.publisher.findFirst({ where: { name: { equals: pubName, mode: "insensitive" } } });
          if (found) {
            publisherId = found.id;
            if (!found.knownFromAddresses.includes(fromEmail)) {
              await prisma.publisher.update({ where: { id: found.id }, data: { knownFromAddresses: { push: fromEmail } } });
            }
          }
        }
      }
    }
    } // end non-affiliate publisher resolution

    // ── List matching — must always resolve ──
    let listId: string | null = null;
    if (isAffiliateSeed) {
      listId = await upsertAffiliateList(affiliateSeed!.list, publisherId);
    } else {
    // Priority: pre-processor (subject/from-address) → AI result → masthead title tag → Claude fallback → from-name
    const preProcessorName = extractListFromSignals(subject, fromEmail, fromName);
    const mastheadTitle = mastheadContext.match(/Email title: "([^"]+)"/)?.[1]?.trim();
    let detectedListName: string | null = preProcessorName ?? result.list ?? mastheadTitle ?? null;

    if (!detectedListName) {
      // Ask Claude specifically about the list, with publisher context
      const publisherLists = lists.filter(l => l.publisherId === publisherId).map(l => l.name);
      const aiList = await suggestListViaClaude(fromEmail, fromName, subject, cleanBody, publisherLists);
      detectedListName = aiList;
    }

    if (!detectedListName) {
      // Last resort: derive from from-name or from-email local part
      const localPart = fromEmail.split("@")[0] ?? "";
      if (fromName && fromName.length > 2 && fromName.length < 80) {
        detectedListName = fromName;
      } else if (localPart.length > 2) {
        // Convert CamelCase or slug → readable name
        detectedListName = localPart
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/-/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase())
          .trim();
      } else {
        detectedListName = emailDomain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Unknown List";
      }
      console.log(`  ↳ last-resort list name derived: "${detectedListName}"`);
    }

    if (detectedListName) {
      // Canonicalize for matching: lowercase, strip leading "The ", strip trailing
      // punctuation, collapse whitespace. Prevents near-duplicate lists like
      // "The Rude Awakening" vs "Rude Awakening" or "Trade of the Day." variants.
      const canon = (s: string) =>
        s.toLowerCase().trim()
          .replace(/^the\s+/, "")
          .replace(/[\s.,!?:;'"-]+$/, "")
          .replace(/\s+/g, " ")
          .trim();
      const detectedLower = detectedListName.toLowerCase();
      const detectedCanon = canon(detectedListName);
      const existingList = lists.find(l =>
        l.name.toLowerCase() === detectedLower ||
        canon(l.name) === detectedCanon ||
        l.synonyms.some(s => s.toLowerCase() === detectedLower || canon(s) === detectedCanon)
      );
      if (existingList) {
        listId = existingList.id;
        if (!existingList.publisherId && publisherId) {
          await prisma.list.update({ where: { id: listId }, data: { publisherId } });
        }
      } else {
        // Create it — mark autoCreated so the UI can indicate it was AI-generated
        const wasAutoCreated = !preProcessorName && !result.list && !mastheadTitle;
        try {
          const newList = await prisma.list.create({
            data: { name: detectedListName, publisherId, isIgnored: false, autoCreated: wasAutoCreated },
          });
          listId = newList.id;
        } catch {
          // Name may already exist (race condition) — try to find it
          const found = await prisma.list.findFirst({ where: { name: { equals: detectedListName, mode: "insensitive" } } });
          if (found) listId = found.id;
        }
      }
    }
    } // end non-affiliate list resolution

    // ── Guru matching ──
    // For affiliate seeds we still record WHO the promo is for (EmailGuru), but we
    // never link bylined gurus to the affiliate's list (they aren't the affiliate's editors).
    const guruIds: string[] = [];
    for (const guruName of (result.gurus ?? [])) {
      if (ignoredGuruNames.has(guruName.toLowerCase())) continue;
      const existing = gurus.find(g => g.name.toLowerCase() === guruName.toLowerCase());

      // If this name is a known secondary voice, route to their primary gurus instead
      const primaryIds = secondaryToPrimary.get(guruName.toLowerCase());
      if (primaryIds?.length) {
        for (const pid of primaryIds) {
          if (!guruIds.includes(pid)) guruIds.push(pid);
        }
        continue; // don't tag the secondary voice directly on the email
      }

      if (existing) {
        // Skip secondary voices from direct email tagging
        if (existing.isSecondaryVoice) continue;
        guruIds.push(existing.id);
        // Auto-link guru to list — but SKIP if user has marked this association as ignored,
        // and SKIP entirely for affiliate seeds (bylined gurus don't belong to the affiliate)
        if (listId && !isAffiliateSeed) {
          const linked = await prisma.guruList.findUnique({ where: { guruId_listId: { guruId: existing.id, listId } } });
          if (!linked) {
            await prisma.guruList.create({ data: { guruId: existing.id, listId, isPrimary: false } });
          } else if (linked.isIgnored) {
            // User rejected this association — don't re-add
          } else {
            // Already linked, nothing to do
          }
        }
      } else {
        const newGuru = await prisma.guru.create({ data: { name: guruName } });
        guruIds.push(newGuru.id);
        if (listId && !isAffiliateSeed) {
          // Check if this new guru was pre-rejected for this list
          const rejected = await prisma.guruList.findUnique({ where: { guruId_listId: { guruId: newGuru.id, listId } } });
          if (!rejected?.isIgnored) {
            await prisma.guruList.upsert({ where: { guruId_listId: { guruId: newGuru.id, listId } }, update: {}, create: { guruId: newGuru.id, listId, isPrimary: false } });
          }
        }
      }
    }

    // ── Topics ──
    // WELCOME maps to EDITORIAL (most financial onboarding is editorial-flavoured)
    // UNKNOWN → EDITORIAL as best-guess default — no email should ever be stored as UNKNOWN
    const rawType = result.emailType ?? "UNKNOWN";
    const dbEmailType = (rawType === "WELCOME" || rawType === "UNKNOWN" ? "EDITORIAL" : rawType) as "LIFT_NOTE" | "EDITORIAL" | "PROMO";
    const validTopics = (result.topics ?? []).filter(t => t && !ignoredTopicNames.has(t.toLowerCase()));
    const topicRecords = await Promise.all(
      validTopics.map(name => prisma.topic.upsert({ where: { name: name.toLowerCase() }, update: {}, create: { name: name.toLowerCase() } }))
    );

    // ── Save ──
    await prisma.email.update({
      where: { id: emailId },
      data: {
        publisherId,
        publisherConfirmed: publisherId !== null,
        listId,
        listConfirmed: listId !== null,
        emailType: dbEmailType,
        aiSummary: result.summary || null,
        aiTicker: result.offer?.ticker || null,
        aiConfidence: result.publisherConfidence,
        isProcessed: true,
        topics: { deleteMany: {}, create: topicRecords.map(t => ({ topicId: t.id, confidence: 1.0 })) },
        gurus: { deleteMany: {}, create: guruIds.map(guruId => ({ guruId })) },
      },
    });

    if (result.offer?.url || result.offer?.promise) {
      await prisma.offer.upsert({
        where: { emailId },
        update: { url: result.offer.url, promise: result.offer.promise, ticker: result.offer.ticker },
        create: { emailId, url: result.offer.url, promise: result.offer.promise, ticker: result.offer.ticker },
      });
    }

    // Save AI learnings
    for (const learning of (result.learnings ?? [])) {
      if (learning.text?.trim()) {
        await logAILearning({
          content: learning.text.trim(),
          category: learning.category ?? "GENERAL",
          emailId,
          publisherId: publisherId ?? undefined,
          listId: listId ?? undefined,
        });
      }
    }

    console.log(`✓ ${subject.substring(0, 50)} | ${dbEmailType} | list:${result.list ?? "none"} | learnings:${result.learnings?.length ?? 0}`);
  } catch (err) {
    console.error(`✗ Analysis failed [${emailId}]:`, err);
    // Do NOT mark as processed — leave isProcessed: false so the retry pass picks it up
  }
}
