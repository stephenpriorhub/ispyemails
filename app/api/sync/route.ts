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
    select: { id: true, subject: true, fromName: true, fromEmail: true, bodyText: true, bodyHtml: true },
    take: batchSize,
    orderBy: { receivedAt: "desc" },
  });

  const remaining = await prisma.email.count({ where: { isProcessed: false } });

  if (!emails.length) return NextResponse.json({ processed: 0, remaining: 0 });

  const { analyzeEmail } = await import("@/lib/analyze");
  let processed = 0;
  const errors: string[] = [];

  for (const email of emails) {
    try {
      await analyzeEmail(email.id, email.subject, email.fromName ?? "", email.fromEmail, email.bodyText, email.bodyHtml);
      processed++;
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
