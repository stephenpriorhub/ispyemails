import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Retroactively extract learnings from already-processed emails
// without re-running the full analysis pipeline
export async function POST(req: NextRequest) {
  const { days = 30 } = await req.json().catch(() => ({ days: 30 }));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const emails = await prisma.email.findMany({
    where: {
      isProcessed: true,
      receivedAt: { gte: since },
      learnings: { none: {} }, // skip emails that already have learnings
    },
    include: {
      publisher: { select: { id: true, name: true } },
      list: { select: { id: true, name: true } },
      gurus: { include: { guru: { select: { id: true, name: true } } } },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  let extracted = 0;
  let total = 0;

  for (const email of emails) {
    total++;
    if (!email.bodyText && !email.snippet) continue;

    const body = (email.bodyText ?? email.snippet ?? "").substring(0, 2000);
    const context = [
      email.publisher && `Publisher: ${email.publisher.name}`,
      email.list && `List: ${email.list.name}`,
      email.gurus.length > 0 && `Editors: ${email.gurus.map(g => g.guru.name).join(", ")}`,
    ].filter(Boolean).join(" | ");

    try {
      const msg = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `You are analyzing a financial newsletter email to extract SIGNIFICANT insights about the publisher, editors, or newsletters.

${context}
SUBJECT: ${email.subject}
BODY: ${body}

Extract 0-2 NOTABLE learnings. Only include if genuinely significant — new services launched, notable positions/views of specific gurus, relationships between people/companies, new newsletters, corrections to identity (same person different names).

Return JSON array only (empty array if nothing notable):
[{"text":"Insight here","category":"GURU|PUBLISHER|LIST|GENERAL"}]`,
        }],
      });

      const content = msg.content[0];
      if (content.type !== "text") continue;

      const match = content.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").match(/\[[\s\S]*\]/);
      if (!match) continue;

      const learnings = JSON.parse(match[0]) as { text: string; category: string }[];
      for (const l of learnings) {
        if (!l.text?.trim()) continue;
        await prisma.learning.create({
          data: {
            content: l.text.trim(),
            source: "AI_EMAIL",
            category: (l.category as "GURU" | "PUBLISHER" | "LIST" | "TOPIC" | "GENERAL") ?? "GENERAL",
            emailId: email.id,
            publisherId: email.publisherId,
            listId: email.listId,
          },
        });
        extracted++;
      }
    } catch {
      // skip this email if extraction fails
    }
  }

  return NextResponse.json({ scanned: total, extracted });
}
