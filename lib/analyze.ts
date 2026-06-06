import { prisma } from "./prisma";

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
}

export async function analyzeEmail(
  emailId: string,
  subject: string,
  fromName: string,
  fromEmail: string,
  bodyText: string | null,
  bodyHtml: string | null
): Promise<void> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const [publishers, lists, gurus, existingTopics, ignoredTopics, ignoredGurus, secondaryVoices] = await Promise.all([
    prisma.publisher.findMany({ select: { id: true, name: true, domains: true, knownFromAddresses: true, type: true } }),
    prisma.list.findMany({ where: { isIgnored: false }, select: { id: true, name: true, publisherId: true } }),
    prisma.guru.findMany({ where: { isIgnored: false }, select: { id: true, name: true, isSecondaryVoice: true } }),
    prisma.topic.findMany({ where: { isIgnored: false }, select: { name: true, synonyms: true } }),
    prisma.topic.findMany({ where: { isIgnored: true }, select: { name: true, synonyms: true } }),
    prisma.guru.findMany({ where: { isIgnored: true }, select: { name: true } }),
    // Load secondary voices with their primary gurus for routing
    prisma.secondaryVoiceGuru.findMany({
      include: { secondaryVoice: { select: { id: true, name: true } }, primaryGuru: { select: { id: true, name: true } } },
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

  const ignoredTopicNames = new Set([
    ...ignoredTopics.flatMap(t => [t.name.toLowerCase(), ...t.synonyms.map(s => s.toLowerCase())]),
  ]);
  const ignoredGuruNames = new Set(ignoredGurus.map(g => g.name.toLowerCase()));

  const topicList = existingTopics
    .map(t => t.synonyms.length > 0 ? `${t.name} (also: ${t.synonyms.join(", ")})` : t.name)
    .join(", ");

  const prompt = `You are an expert analyst of financial newsletter emails in the direct-response publishing industry.
Analyze this email and return ONLY valid JSON — no markdown, no explanation.

FROM: ${fromName || fromEmail} <${fromEmail}>
SUBJECT: ${subject}
BODY: ${cleanBody}

KNOWN PUBLISHERS: ${publishers.map(p => `${p.name} (${p.domains.join(", ")}) [${p.type}]`).join(" | ") || "None"}
KNOWN NEWSLETTERS/LISTS: ${lists.map(l => l.name).join(", ") || "None"}
KNOWN PRIMARY EDITORS/GURUS: ${gurus.filter(g => !g.isSecondaryVoice).map(g => g.name).join(", ") || "None"}
SECONDARY VOICES (contributors/managing editors — NOT primary gurus, do not tag as main guru): ${gurus.filter(g => g.isSecondaryVoice).map(g => g.name).join(", ") || "None"}
EXISTING TOPICS (reuse): ${topicList || "None"}
IGNORED TOPICS (never use): ${[...ignoredTopicNames].join(", ") || "None"}
IGNORED GURUS (never use): ${[...ignoredGuruNames].join(", ") || "None"}

Return ONLY this JSON:
{
  "publisher": "Publisher name from list or null",
  "publisherConfidence": 0.0,
  "list": "Newsletter/list name (check masthead/header) or null",
  "listConfidence": 0.0,
  "gurus": ["Editor or author names found in the email"],
  "emailType": "LIFT_NOTE|EDITORIAL|PROMO|WELCOME|UNKNOWN",
  "topics": ["topic1", "topic2"],
  "offer": { "url": "https://... or null", "promise": "pitch or null", "ticker": "TICK or null" },
  "summary": "2-3 sentence summary of what this email is about."
}

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

    // ── Publisher matching ──
    const emailDomain = (fromEmail.toLowerCase().split("@")[1] ?? "");
    let publisherId: string | null = null;

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
      } else if (result.publisher && result.publisherConfidence >= 0.75) {
        const newPub = await prisma.publisher.create({
          data: { name: result.publisher, domains: emailDomain ? [emailDomain] : [], knownFromAddresses: [fromEmail], isConfirmed: false },
        });
        publisherId = newPub.id;
      }
    }

    // ── List matching ──
    let listId: string | null = null;
    if (result.list) {
      const existingList = lists.find(l => l.name.toLowerCase() === result.list!.toLowerCase());
      if (existingList) {
        listId = existingList.id;
        // Auto-link to publisher if not set
        if (!existingList.publisherId && publisherId) {
          await prisma.list.update({ where: { id: listId }, data: { publisherId } });
        }
      } else if (result.listConfidence >= 0.7) {
        const newList = await prisma.list.create({
          data: { name: result.list, publisherId, isIgnored: false },
        });
        listId = newList.id;
      }
    }

    // ── Guru matching ──
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
        // Auto-link guru to list — but SKIP if user has marked this association as ignored
        if (listId) {
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
        if (listId) {
          // Check if this new guru was pre-rejected for this list
          const rejected = await prisma.guruList.findUnique({ where: { guruId_listId: { guruId: newGuru.id, listId } } });
          if (!rejected?.isIgnored) {
            await prisma.guruList.upsert({ where: { guruId_listId: { guruId: newGuru.id, listId } }, update: {}, create: { guruId: newGuru.id, listId, isPrimary: false } });
          }
        }
      }
    }

    // ── Topics ──
    const dbEmailType = (result.emailType === "WELCOME" ? "UNKNOWN" : result.emailType) as "LIFT_NOTE" | "EDITORIAL" | "PROMO" | "UNKNOWN";
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

    console.log(`✓ ${subject.substring(0, 50)} | ${dbEmailType} | list:${result.list ?? "none"} | gurus:${result.gurus?.join(",") ?? "none"}`);
  } catch (err) {
    console.error(`✗ Analysis failed [${emailId}]:`, err);
    await prisma.email.update({ where: { id: emailId }, data: { isProcessed: true } });
  }
}
