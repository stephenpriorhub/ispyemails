import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/learnings/reexport
 *
 * Recovery endpoint for the "false-flagged appended" incident: brain-map's
 * /api/intelligence used to return HTTP 200 even when its git push failed, so
 * iSpy marked those learnings appendedToBrain=true even though the blocks never
 * reached the vault (~16 blocks lost). Those learnings will not re-export on
 * their own because the export query filters on appendedToBrain=false.
 *
 * This endpoint resets appendedToBrain=false (and clears appendedAt) for all
 * AI_EMAIL learnings that were previously marked appended, so the next brain
 * sync re-pushes them. This is safe to run repeatedly: brain-map's intelligence
 * route is idempotent (it upserts by entity), so re-pushing everything will not
 * create duplicates.
 *
 * Protection matches the existing cron convention (see /api/cron/email-sync):
 *   - x-cron-secret header or ?secret= query param must equal CRON_SECRET, OR
 *   - x-hub-token header must equal HUB_API_TOKEN.
 * If neither secret is configured on the service, the endpoint is open.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const hubToken = process.env.HUB_API_TOKEN;

  if (cronSecret || hubToken) {
    const url = new URL(req.url);
    const cronAuth = req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
    const hubAuth = req.headers.get("x-hub-token");

    const cronOk = !!cronSecret && cronAuth === cronSecret;
    const hubOk = !!hubToken && hubAuth === hubToken;

    if (!cronOk && !hubOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await prisma.learning.updateMany({
    where: { source: "AI_EMAIL", appendedToBrain: true },
    data: { appendedToBrain: false, appendedAt: null },
  });

  console.log(`[BrainReexport] Reset appendedToBrain=false for ${result.count} learnings`);

  return NextResponse.json({
    ok: true,
    reset: result.count,
    message: `Reset ${result.count} learnings for re-export. They will re-push on the next brain sync (or POST /api/learnings/export).`,
  });
}
