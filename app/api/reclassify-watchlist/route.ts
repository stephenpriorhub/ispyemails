import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeEmail } from "@/lib/analyze";

/**
 * POST /api/reclassify-watchlist
 *
 * Targeted recovery for historically MISFILED "Trade of the Day Wakeup Watchlist"
 * emails. The MTA Trade-of-the-Day sender uses one address for two distinct lists;
 * before the deterministic from-name/subject routing rule was added (see
 * extractListFromSignals in lib/analyze.ts), Watchlist sends were inconsistently
 * filed under plain "Trade of the Day".
 *
 * This endpoint re-runs FULL classification (analyzeEmail) ONLY on emails from that
 * sender whose from-name or subject matches the Watchlist pattern (wake-up / watchlist)
 * but which are NOT already in the Watchlist list. analyzeEmail now routes them
 * deterministically, so this corrects them without blind mutation.
 *
 * Safe + idempotent: re-running it on an already-correct email is a no-op reclassify.
 *
 * Trigger: POST https://ispy.oxfordhub.app/api/reclassify-watchlist
 */
const SENDER = "tradeoftheday@mb.mtatradeoftheday.com";
const WATCHLIST_LIST_NAME = "Trade of the Day Wakeup Watchlist";

export async function POST() {
  // Candidate misfiled emails: from the MTA sender, signal matches Watchlist,
  // but currently NOT already filed under the Watchlist list.
  const candidates = await prisma.email.findMany({
    where: {
      fromEmail: { equals: SENDER, mode: "insensitive" },
      OR: [
        { fromName: { contains: "watchlist", mode: "insensitive" } },
        { fromName: { contains: "wake", mode: "insensitive" } },
        { subject: { contains: "watchlist", mode: "insensitive" } },
        { subject: { contains: "wakeup", mode: "insensitive" } },
        { subject: { contains: "wake-up", mode: "insensitive" } },
      ],
      NOT: { list: { name: { equals: WATCHLIST_LIST_NAME, mode: "insensitive" } } },
    },
    select: {
      id: true,
      subject: true,
      fromName: true,
      fromEmail: true,
      toEmail: true,
      bodyText: true,
      bodyHtml: true,
    },
    take: 200,
  });

  let reclassified = 0;
  let errors = 0;

  for (const email of candidates) {
    try {
      await analyzeEmail(
        email.id,
        email.subject,
        email.fromName ?? "",
        email.fromEmail,
        email.bodyText,
        email.bodyHtml,
        email.toEmail
      );
      reclassified++;
    } catch (err) {
      console.error(`[reclassify-watchlist] Failed [${email.id}]:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    found: candidates.length,
    reclassified,
    errors,
    message: candidates.length === 0
      ? "No misfiled Watchlist emails found — all correctly classified."
      : `Re-ran classification on ${reclassified} candidate emails (${errors} errors). They now route to "${WATCHLIST_LIST_NAME}" via the deterministic rule.`,
  });
}
