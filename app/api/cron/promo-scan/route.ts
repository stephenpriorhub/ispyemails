import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanDay, etYesterday } from "@/lib/promo-tracker";
import { requireAdminOrCron } from "@/lib/promo-auth";

export const maxDuration = 800;

/**
 * Resolve yesterday's promo links. Runs at ET midnight from the scheduler; also
 * callable by hand with ?day=YYYY-MM-DD (&force=1 to re-scan already-scanned mail).
 */
export async function GET(req: Request) {
  const denied = await requireAdminOrCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const day = url.searchParams.get("day") ?? etYesterday();
  const force = url.searchParams.get("force") === "1";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }

  return runScan(day, force);
}

export async function runScan(day: string, force = false) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const run = await prisma.promoJobRun.upsert({
    where: { kind_day: { kind: "SCAN", day: date } },
    update: { status: "RUNNING", startedAt: new Date(), finishedAt: null, error: null },
    create: { kind: "SCAN", day: date, status: "RUNNING" },
  });

  try {
    const result = await scanDay(day, { force });
    await prisma.promoJobRun.update({
      where: { id: run.id },
      data: {
        status: "OK",
        emailsScanned: result.emailsScanned,
        promosFound: result.sightings,
        newPromos: result.newPromos,
        error: result.errors.length ? result.errors.slice(0, 20).join("\n") : null,
        finishedAt: new Date(),
      },
    });
    console.log(
      `[iSpyFinpub] Promo scan ${day}: ${result.emailsScanned} emails → ${result.sightings} sightings, ${result.newPromos} new, ${result.unresolved} unresolved`,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "scan failed";
    await prisma.promoJobRun.update({
      where: { id: run.id },
      data: { status: "ERROR", error: message, finishedAt: new Date() },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
