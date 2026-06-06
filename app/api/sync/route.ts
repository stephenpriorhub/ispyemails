import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGmailAccount } from "@/lib/sync";
import { getSessionUser, isAdminRole } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET() {
  // Only admins can manually trigger sync
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";
  const user = await getSessionUser().catch(() => null);
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const accounts = await prisma.gmailAccount.findMany({ where: { isActive: true } });
  if (!accounts.length) return NextResponse.json({ message: "No active Gmail accounts" });
  const results = [];
  for (const account of accounts) {
    try { results.push({ email: account.email, ...(await syncGmailAccount(account.email)) }); }
    catch (err) { results.push({ email: account.email, error: err instanceof Error ? err.message : "Unknown" }); }
  }
  return NextResponse.json({ results, syncedAt: new Date().toISOString() });
}

export async function POST() {
  const user = await getSessionUser().catch(() => null);
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const emails = await prisma.email.findMany({
    where: { isProcessed: false },
    select: { id: true, subject: true, fromName: true, fromEmail: true, bodyText: true, bodyHtml: true },
  });
  const { analyzeEmail } = await import("@/lib/analyze");
  let processed = 0;
  for (const email of emails) {
    await analyzeEmail(email.id, email.subject, email.fromName ?? "", email.fromEmail, email.bodyText, email.bodyHtml);
    processed++;
  }
  return NextResponse.json({ processed, total: emails.length });
}

export async function DELETE() {
  const user = await getSessionUser().catch(() => null);
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  await prisma.gmailAccount.updateMany({ data: { historyId: null } });
  return NextResponse.json({ ok: true, message: "historyId cleared — next sync will backfill all emails" });
}
