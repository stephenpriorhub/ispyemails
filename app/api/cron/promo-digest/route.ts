import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildDigest } from "@/lib/promo-digest";
import { etYesterday } from "@/lib/promo-tracker";
import { postToSlack } from "@/lib/slack";
import { requireAdminOrCron } from "@/lib/promo-auth";

export const maxDuration = 300;

/**
 * Build the previous-day promo report. Runs at 8am ET; ?preview=1 renders it
 * without posting or recording a run, which is how you check it before wiring
 * Slack up.
 */
export async function GET(req: Request) {
  const denied = await requireAdminOrCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const day = url.searchParams.get("day") ?? etYesterday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }

  if (url.searchParams.get("preview") === "1") {
    const digest = await buildDigest(day);
    return NextResponse.json({ preview: true, ...digest });
  }
  return runDigest(day);
}

export async function runDigest(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const run = await prisma.promoJobRun.upsert({
    where: { kind_day: { kind: "DIGEST", day: date } },
    update: { status: "RUNNING", startedAt: new Date(), finishedAt: null, error: null },
    create: { kind: "DIGEST", day: date, status: "RUNNING" },
  });

  try {
    const digest = await buildDigest(day);
    const slack = await postToSlack(digest.text);
    await prisma.promoJobRun.update({
      where: { id: run.id },
      data: {
        status: "OK",
        promosFound: digest.totalPromos,
        digestText: digest.text,
        slackTs: slack.ts ?? null,
        error: slack.ok ? null : (slack.error ?? slack.skipped ?? null),
        finishedAt: new Date(),
      },
    });
    console.log(
      `[iSpyFinpub] Promo digest ${day}: ${digest.totalPromos} promos — Slack ${slack.ok ? "posted" : (slack.skipped ?? slack.error)}`,
    );
    return NextResponse.json({ day, totalPromos: digest.totalPromos, slack, text: digest.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "digest failed";
    await prisma.promoJobRun.update({
      where: { id: run.id },
      data: { status: "ERROR", error: message, finishedAt: new Date() },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
