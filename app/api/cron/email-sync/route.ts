import { NextResponse } from "next/server";
import { Resend } from "resend";
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
  const invalidGrantAccounts: string[] = [];

  for (const account of accounts) {
    try {
      const result = await syncGmailAccount(account.email);
      results.push({ email: account.email, ...result });
      totalNew += result.newEmails ?? 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown";
      results.push({ email: account.email, error: message });
      if (message.toLowerCase().includes("invalid_grant")) {
        invalidGrantAccounts.push(account.email);
      }
    }
  }

  // Send a single alert email if any accounts returned invalid_grant
  if (invalidGrantAccounts.length > 0) {
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    const accountList = invalidGrantAccounts.map((e) => `  • ${e}`).join("\n");
    const body = [
      "iSpy Gmail sync alert",
      "",
      `The following Gmail account${invalidGrantAccounts.length > 1 ? "s" : ""} returned an invalid_grant error during the scheduled sync:`,
      "",
      accountList,
      "",
      "What does invalid_grant mean?",
      "This error means the OAuth refresh token for the account has been revoked or expired. This typically happens when the Google account password was changed, the app was manually disconnected in Google's security settings, or the token was idle for too long.",
      "",
      "To fix this, the account needs to be re-authorized. Visit the link below and reconnect the affected Gmail account(s):",
      "",
      "https://ispy.oxfordhub.app/api/gmail/connect",
      "",
      "Until the account is re-authorized, emails from that account will not be synced.",
    ].join("\n");

    try {
      if (!resend) {
        console.warn("[iSpyFinpub] RESEND_API_KEY not set — skipping invalid_grant alert email");
      } else {
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: "sprior@monumenttradersalliance.com",
          subject: "[iSpy] Gmail sync broken — re-auth required",
          text: body,
        });
        console.log(`[iSpyFinpub] Sent invalid_grant alert for: ${invalidGrantAccounts.join(", ")}`);
      }
    } catch (alertErr) {
      console.error("[iSpyFinpub] Failed to send invalid_grant alert:", alertErr);
    }
  }

  console.log(`[iSpyFinpub] Cron email-sync: ${totalNew} new email(s) at ${new Date().toISOString()}`);
  return NextResponse.json({ results, totalNew, syncedAt: new Date().toISOString() });
}
