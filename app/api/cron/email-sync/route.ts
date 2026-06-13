import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGmailAccount } from "@/lib/sync";

// Called by Railway cron every hour: GET /api/cron/email-sync
// Protected by CRON_SECRET env var (set same value in Railway + cron job header)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
    if (auth !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const accounts = await prisma.gmailAccount.findMany({ where: { isActive: true } });
  if (!accounts.length) return NextResponse.json({ message: "No active Gmail accounts" });

  const results = [];
  let totalNew = 0;
  for (const account of accounts) {
    try {
      const result = await syncGmailAccount(account.email);
      results.push({ email: account.email, ...result });
      totalNew += result.newEmails ?? 0;
    } catch (err) {
      results.push({ email: account.email, error: err instanceof Error ? err.message : "Unknown" });
    }
  }

  console.log(`[iSpyFinpub] Cron email-sync: ${totalNew} new email(s) at ${new Date().toISOString()}`);
  return NextResponse.json({ results, totalNew, syncedAt: new Date().toISOString() });
}
