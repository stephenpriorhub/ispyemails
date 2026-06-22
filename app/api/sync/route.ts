import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGmailAccount } from "@/lib/sync";

export async function GET() {
  const accounts = await prisma.gmailAccount.findMany({ where: { isActive: true } });
  if (!accounts.length) return NextResponse.json({ message: "No active Gmail accounts" });
  const results = [];
  for (const account of accounts) {
    try { results.push({ email: account.email, ...(await syncGmailAccount(account.email)) }); }
    catch (err) { results.push({ email: account.email, error: err instanceof Error ? err.message : "Unknown" }); }
  }
  return NextResponse.json({ results, syncedAt: new Date().toISOString() });
}

// POST: analyze a batch of unprocessed emails. Returns remaining count.
// Call repeatedly until remaining === 0.
export async function POST(req: NextRequest) {
  const { batchSize = 10 } = await req.json().catch(() => ({ batchSize: 10 }));

  const emails = await prisma.email.findMany({
    where: { isProcessed: false },
    select: { id: true, subject: true, fromName: true, fromEmail: true, toEmail: true, bodyText: true, bodyHtml: true },
    take: batchSize,
    orderBy: { receivedAt: "desc" },
  });

  const remaining = await prisma.email.count({ where: { isProcessed: false } });

  if (!emails.length) return NextResponse.json({ processed: 0, remaining: 0 });

  const { analyzeEmail, runDeepAnalysis } = await import("@/lib/analyze");
  let processed = 0;
  const errors: string[] = [];

  for (const email of emails) {
    try {
      await analyzeEmail(email.id, email.subject, email.fromName ?? "", email.fromEmail, email.bodyText, email.bodyHtml, email.toEmail);
      processed++;

      // Pass 2: fire-and-forget deep analysis for PROMO, LIFT_NOTE, EDITORIAL
      const DEEP_TYPES = ["PROMO", "LIFT_NOTE", "EDITORIAL"];
      const updatedEmail = await prisma.email.findUnique({
        where: { id: email.id },
        select: { emailType: true, publisher: { select: { name: true } }, list: { select: { name: true } }, gurus: { include: { guru: { select: { name: true } } } } },
      });
      if (updatedEmail && DEEP_TYPES.includes(updatedEmail.emailType)) {
        runDeepAnalysis({
          id: email.id,
          subject: email.subject,
          bodyHtml: email.bodyHtml,
          bodyText: email.bodyText,
          emailType: updatedEmail.emailType,
          publisherName: updatedEmail.publisher?.name ?? null,
          listName: updatedEmail.list?.name ?? null,
          guruName: updatedEmail.gurus[0]?.guru?.name ?? null,
          receivedAt: new Date(),
        }).catch(err => console.error(`[DeepAnalysis fire-and-forget] ${email.id}:`, err));
      }
    } catch (err) {
      errors.push(`${email.subject.substring(0, 40)}: ${err instanceof Error ? err.message.substring(0, 60) : "unknown"}`);
      // Mark as processed to avoid infinite retry
      await prisma.email.update({ where: { id: email.id }, data: { isProcessed: true } });
    }
  }

  const stillRemaining = await prisma.email.count({ where: { isProcessed: false } });
  return NextResponse.json({ processed, remaining: stillRemaining, errors });
}

export async function DELETE() {
  await prisma.gmailAccount.updateMany({ data: { historyId: null } });
  return NextResponse.json({ ok: true, message: "historyId cleared — next sync will backfill all emails" });
}

// PATCH: lightweight list-only detection for emails missing a list.
// Does NOT re-run full analysis (no topics, gurus, publisher re-matching).
// Just extracts the list name and assigns it.
export async function PATCH(req: NextRequest) {
  const { batchSize = 15 } = await req.json().catch(() => ({ batchSize: 15 }));

  const remaining = await prisma.email.count({ where: { listId: null } });
  const emails = await prisma.email.findMany({
    where: { listId: null },
    select: { id: true, subject: true, fromEmail: true, fromName: true, bodyHtml: true, publisherId: true },
    take: batchSize,
    orderBy: { receivedAt: "desc" },
  });

  if (!emails.length) return NextResponse.json({ processed: 0, remaining: 0 });

  const { extractListForEmail } = await import("@/lib/analyze");
  const existingLists = await prisma.list.findMany({ select: { id: true, name: true, publisherId: true } });

  let processed = 0;
  for (const email of emails) {
    const listName = await extractListForEmail(email.subject, email.fromEmail, email.bodyHtml, email.fromName ?? "");
    if (listName) {
      // Find or create the list
      const existing = existingLists.find(l => l.name.toLowerCase() === listName.toLowerCase());
      let listId: string;
      if (existing) {
        listId = existing.id;
      } else {
        try {
          const newList = await prisma.list.create({
            data: { name: listName, publisherId: email.publisherId ?? null, isIgnored: false },
          });
          listId = newList.id;
          existingLists.push({ id: listId, name: listName, publisherId: email.publisherId ?? null });
        } catch {
          const found = await prisma.list.findFirst({ where: { name: { equals: listName, mode: "insensitive" } } });
          if (!found) continue;
          listId = found.id;
        }
      }
      await prisma.email.update({ where: { id: email.id }, data: { listId, listConfirmed: true } });
      processed++;
    }
  }

  const stillRemaining = await prisma.email.count({ where: { listId: null } });
  return NextResponse.json({ processed, remaining: stillRemaining });
}
