import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGmailAccount } from "@/lib/sync";

// POST /api/gmail/backfill — clears historyId to force a full re-sync from recent messages
// Use this to recover emails missed during an invalid_grant gap
export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({}));
    const where = email ? { email } : {};
    const accounts = await prisma.gmailAccount.findMany({ where: { ...where, isActive: true } });
    if (!accounts.length) return NextResponse.json({ error: "No active accounts found" }, { status: 404 });

    const results = [];
    for (const account of accounts) {
      // Clear historyId so next sync falls back to getRecentMessageIds (last 365 days)
      await prisma.gmailAccount.update({ where: { email: account.email }, data: { historyId: null } });
      const result = await syncGmailAccount(account.email);
      results.push({ email: account.email, ...result });
    }
    return NextResponse.json({ results, backfilledAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
