import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import type { EmailType } from "@prisma/client";
const DEEP_TYPES: EmailType[] = ["PROMO", "LIFT_NOTE", "EDITORIAL"];
const CONCURRENCY = 5;

/**
 * POST /api/emails/deep-analyze
 *
 * Backfill endpoint — finds all PROMO, LIFT_NOTE, EDITORIAL emails without an
 * existing EmailAnalysis record and runs Pass 2 (runDeepAnalysis) on each.
 * Rate-limited to 5 concurrent Sonnet calls.
 *
 * Returns: { queued, completed, failed, skipped }
 */
export async function POST() {
  // Find eligible emails that have no deep analysis yet
  const emails = await prisma.email.findMany({
    where: {
      emailType: { in: DEEP_TYPES },
      deepAnalysis: null,
    },
    include: {
      publisher: { select: { name: true } },
      list: { select: { name: true } },
      gurus: { include: { guru: { select: { name: true } } } },
    },
    orderBy: { receivedAt: "desc" },
  });

  if (!emails.length) {
    return NextResponse.json({ queued: 0, completed: 0, failed: 0, skipped: 0, message: "Nothing to backfill" });
  }

  const { runDeepAnalysis } = await import("@/lib/analyze");

  let completed = 0;
  let failed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const batch = emails.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(email =>
        runDeepAnalysis({
          id: email.id,
          subject: email.subject,
          bodyHtml: email.bodyHtml,
          bodyText: email.bodyText,
          emailType: email.emailType,
          publisherName: email.publisher?.name ?? null,
          listName: email.list?.name ?? null,
          guruName: email.gurus[0]?.guru?.name ?? null,
          receivedAt: email.receivedAt,
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) completed++;
      else failed++;
    }
  }

  return NextResponse.json({
    queued: emails.length,
    completed,
    failed,
    skipped: emails.length - completed - failed,
  });
}
