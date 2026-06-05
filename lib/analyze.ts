import { prisma } from "./prisma";

interface AnalysisResult {
  publisher: string | null;
  publisherConfidence: number;
  emailType: "LIFT_NOTE" | "EDITORIAL" | "PROMO" | "WELCOME" | "UNKNOWN";
  topics: string[];
  offer: { url: string | null; promise: string | null; ticker: string | null };
  summary: string;
}

export async function analyzeEmail(
  emailId: string,
  subject: string,
  fromName: string,
  fromEmail: string,
  bodyText: string | null,
  bodyHtml: string | null
): Promise<void> {
  // Lazy-load Anthropic so env vars are definitely available
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const [publishers, existingTopics, ignoredTopics] = await Promise.all([
    prisma.publisher.findMany({ select: { id: true, name: true, domains: true, knownFromAddresses: true } }),
    prisma.topic.findMany({ where: { isIgnored: false }, select: { name: true, synonyms: true } }),
    prisma.topic.findMany({ where: { isIgnored: true }, select: { name: true, synonyms: true } }),
  ]);

  // Use plain text body, strip excessive whitespace, cap at 4000 chars
  const rawBody = bodyText ?? (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, " ") : "");
  const cleanBody = rawBody.replace(/\s+/g, " ").replace(/&#\d+;/g, " ").trim().substring(0, 4000);

  const ignoredNames = new Set([
    ...ignoredTopics.flatMap((t) => [t.name.toLowerCase(), ...t.synonyms.map((s) => s.toLowerCase())]),
  ]);

  // Show canonical name + synonyms so AI reuses the right name
  const existingTopicNames = existingTopics
    .map((t) => t.synonyms.length > 0 ? `${t.name} (also: ${t.synonyms.join(", ")})` : t.name)
    .join(", ");

  const prompt = `You are an expert analyst of financial newsletter emails in the direct-response publishing industry.

Analyze this email and return ONLY a valid JSON object — no markdown, no explanation.

FROM: ${fromName || fromEmail} <${fromEmail}>
SUBJECT: ${subject}
BODY: ${cleanBody}

KNOWN PUBLISHERS (match by name or domain):
${publishers.map((p) => `- ${p.name} (${p.domains.join(", ")})`).join("\n") || "None yet"}

EXISTING TOPICS (prefer reusing these over creating new ones):
${existingTopicNames || "None yet"}

IGNORED TOPICS (never use these):
${[...ignoredNames].join(", ") || "None"}

Return this exact JSON structure:
{
  "publisher": "Exact publisher name from list above, or null if genuinely unknown",
  "publisherConfidence": 0.0,
  "emailType": "LIFT_NOTE or EDITORIAL or PROMO or WELCOME or UNKNOWN",
  "topics": ["topic1", "topic2"],
  "offer": {
    "url": "https://... or null",
    "promise": "The core hook/promise to reader or null",
    "ticker": "TICKER or null"
  },
  "summary": "2-3 sentence plain English summary of what this email is about and what action it wants the reader to take."
}

DEFINITIONS:
- LIFT_NOTE: A short email promoting ANOTHER publisher's newsletter or product (affiliate/partner promotion). Key signals: "my friend", "I wanted to share", "fellow investor", promotes someone else's work.
- EDITORIAL: Investment analysis, market commentary, stock picks, educational content from the publisher themselves. The meat of a newsletter.
- PROMO: Direct sales email for the publisher's OWN paid product/service/subscription.
- WELCOME: Onboarding, confirmation, "you're signed up" emails. No investment content yet.
- UNKNOWN: Cannot determine type.

TOPIC RULES:
- Max 4 topics. Be specific but not overly granular.
- Good examples: "options trading", "gold", "AI stocks", "SpaceX IPO", "macro", "biotech", "crypto", "small caps"
- Reuse existing topics when they fit. Only create new ones if genuinely needed.
- Never use ignored topics.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    // Extract JSON (handle if wrapped in markdown code block)
    const jsonMatch = content.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in response: ${content.text.substring(0, 200)}`);

    const result: AnalysisResult = JSON.parse(jsonMatch[0]);

    // Match publisher — check known from-addresses first, then domains
    const emailDomain = (fromEmail.toLowerCase().split("@")[1] ?? "");
    let publisherId: string | null = null;

    // First: exact from-address match
    const exactMatch = publishers.find((p) => p.knownFromAddresses.includes(fromEmail));
    if (exactMatch) {
      publisherId = exactMatch.id;
    } else {
      // Second: domain match (including subdomains)
      const domainMatch = publishers.find((p) =>
        p.domains.some((d) => {
          const pd = d.toLowerCase();
          return emailDomain === pd || emailDomain.endsWith("." + pd);
        })
      );
      if (domainMatch) {
        publisherId = domainMatch.id;
        // Learn this address
        if (!domainMatch.knownFromAddresses.includes(fromEmail)) {
          await prisma.publisher.update({
            where: { id: domainMatch.id },
            data: { knownFromAddresses: { push: fromEmail } },
          });
        }
      } else if (result.publisher && result.publisherConfidence >= 0.75) {
        // Third: AI named a publisher confidently — create it
        const domain = emailDomain || "";
        const newPub = await prisma.publisher.create({
          data: {
            name: result.publisher,
            domains: domain ? [domain] : [],
            knownFromAddresses: [fromEmail],
            isConfirmed: false,
          },
        });
        publisherId = newPub.id;
      }
    }

    // Map WELCOME → store as UNKNOWN in DB (schema doesn't have WELCOME)
    const dbEmailType = (result.emailType === "WELCOME" ? "UNKNOWN" : result.emailType) as
      | "LIFT_NOTE" | "EDITORIAL" | "PROMO" | "UNKNOWN";

    // Upsert topics, skipping ignored ones
    const validTopics = (result.topics ?? []).filter(
      (t) => t && !ignoredNames.has(t.toLowerCase())
    );

    const topicRecords = await Promise.all(
      validTopics.map((name) =>
        prisma.topic.upsert({
          where: { name: name.toLowerCase() },
          update: {},
          create: { name: name.toLowerCase() },
        })
      )
    );

    // Save everything to the email
    await prisma.email.update({
      where: { id: emailId },
      data: {
        publisherId,
        publisherConfirmed: publisherId !== null,
        emailType: dbEmailType,
        aiSummary: result.summary || null,
        aiTicker: result.offer?.ticker || null,
        aiConfidence: result.publisherConfidence,
        isProcessed: true,
        topics: {
          deleteMany: {},
          create: topicRecords.map((t) => ({ topicId: t.id, confidence: 1.0 })),
        },
      },
    });

    // Save offer if present
    if (result.offer?.url || result.offer?.promise) {
      await prisma.offer.upsert({
        where: { emailId },
        update: {
          url: result.offer.url,
          promise: result.offer.promise,
          ticker: result.offer.ticker,
        },
        create: {
          emailId,
          url: result.offer.url,
          promise: result.offer.promise,
          ticker: result.offer.ticker,
        },
      });
    }

    console.log(`✓ Analyzed: ${subject.substring(0, 50)} | type:${dbEmailType} | topics:${validTopics.join(",")} | publisher:${publisherId ? "matched" : "none"}`);
  } catch (err) {
    console.error(`✗ Analysis failed for [${emailId}] ${subject.substring(0, 50)}:`, err);
    // Mark processed to avoid infinite retry, but leave type/topics empty
    await prisma.email.update({
      where: { id: emailId },
      data: { isProcessed: true },
    });
  }
}
