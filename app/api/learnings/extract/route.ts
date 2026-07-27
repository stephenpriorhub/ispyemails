import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type Anthropic from "@anthropic-ai/sdk";

// Retroactively extract learnings from already-processed emails without
// re-running the full analysis pipeline.
//
// Uses the Message Batches API (50% token pricing): POST {} submits a batch of
// up to 100 emails and returns immediately; an in-process poller ingests the
// results when the batch ends (typically < 1 hour). POST { "batchId": "..." }
// checks status / re-ingests — recovery path if the server restarted mid-poll
// (batch results stay retrievable for 29 days). Ingestion is idempotent: emails
// that already have learnings are skipped.

const MODEL = "claude-haiku-4-5";

function buildPrompt(email: {
  subject: string | null;
  body: string;
  context: string;
}): string {
  return `You are analyzing a financial newsletter email to extract SIGNIFICANT insights about the publisher, editors, or newsletters.

${email.context}
SUBJECT: ${email.subject}
BODY: ${email.body}

Extract 0-2 NOTABLE learnings. Only include if genuinely significant — new services launched, notable positions/views of specific gurus, relationships between people/companies, new newsletters, corrections to identity (same person different names).

Return JSON array only (empty array if nothing notable):
[{"text":"Insight here","category":"GURU|PUBLISHER|LIST|GENERAL"}]`;
}

async function getClient(): Promise<Anthropic> {
  const { default: AnthropicSdk } = await import("@anthropic-ai/sdk");
  return new AnthropicSdk({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: NextRequest) {
  const { days = 30, batchId } = await req
    .json()
    .catch(() => ({ days: 30, batchId: undefined }));

  if (batchId) return collectBatch(batchId);
  return submitBatch(days);
}

async function submitBatch(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const client = await getClient();

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

  const requests = [];
  for (const email of emails) {
    if (!email.bodyText && !email.snippet) continue;
    const body = (email.bodyText ?? email.snippet ?? "").substring(0, 2000);
    const context = [
      email.publisher && `Publisher: ${email.publisher.name}`,
      email.list && `List: ${email.list.name}`,
      email.gurus.length > 0 &&
        `Editors: ${email.gurus.map((g) => g.guru.name).join(", ")}`,
    ]
      .filter(Boolean)
      .join(" | ");

    requests.push({
      custom_id: email.id, // cuid — already within [a-zA-Z0-9_-]{1,64}
      params: {
        model: MODEL,
        max_tokens: 512,
        messages: [
          {
            role: "user" as const,
            content: buildPrompt({ subject: email.subject, body, context }),
          },
        ],
      },
    });
  }

  if (requests.length === 0) {
    return NextResponse.json({ scanned: emails.length, submitted: 0, batchId: null });
  }

  const batch = await client.messages.batches.create({ requests });

  // Fire-and-forget poller (long-lived Railway server). If the process restarts
  // before the batch ends, re-attach with POST { "batchId": "<id>" }.
  void pollAndIngest(batch.id).catch((e) =>
    console.warn(
      "[learnings/extract] poller error:",
      e instanceof Error ? e.message : e
    )
  );

  return NextResponse.json({
    scanned: emails.length,
    submitted: requests.length,
    batchId: batch.id,
    note: `Batch submitted; learnings ingest automatically when processing ends. Check with POST {"batchId":"${batch.id}"}`,
  });
}

async function pollAndIngest(batchId: string) {
  const client = await getClient();
  const deadline = Date.now() + 25 * 60 * 60 * 1000; // batches expire after 24h
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 60_000));
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status === "ended") {
      const extracted = await ingestResults(batchId);
      console.log(
        `[learnings/extract] batch ${batchId} ended: ${extracted} learnings extracted`
      );
      return;
    }
  }
  console.warn(`[learnings/extract] batch ${batchId} did not end before deadline`);
}

async function collectBatch(batchId: string) {
  const client = await getClient();
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") {
    return NextResponse.json({ batchId, status: batch.processing_status });
  }
  const extracted = await ingestResults(batchId);
  return NextResponse.json({ batchId, status: "ended", extracted });
}

async function ingestResults(batchId: string): Promise<number> {
  const client = await getClient();
  let extracted = 0;

  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type !== "succeeded") continue;
    const emailId = result.custom_id;

    try {
      // Idempotency: skip emails that gained learnings since submission
      // (or if this batch is being re-ingested).
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        select: {
          id: true,
          publisherId: true,
          listId: true,
          _count: { select: { learnings: true } },
        },
      });
      if (!email || email._count.learnings > 0) continue;

      const content = result.result.message.content[0];
      if (!content || content.type !== "text") continue;

      const match = content.text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .match(/\[[\s\S]*\]/);
      if (!match) continue;

      const learnings = JSON.parse(match[0]) as { text: string; category: string }[];
      for (const l of learnings) {
        if (!l.text?.trim()) continue;
        await prisma.learning.create({
          data: {
            content: l.text.trim(),
            source: "AI_EMAIL",
            category:
              (l.category as "GURU" | "PUBLISHER" | "LIST" | "TOPIC" | "GENERAL") ??
              "GENERAL",
            emailId: email.id,
            publisherId: email.publisherId,
            listId: email.listId,
          },
        });
        extracted++;
      }
    } catch {
      // skip this email if ingestion fails
    }
  }
  return extracted;
}
