import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const VIDRIPPER_URL = process.env.VIDRIPPER_URL ?? "https://vidripper.oxfordhub.app";
const ANALYZER_URL = process.env.PROMO_ANALYZER_URL ?? "https://analyzer.oxfordhub.app";
const ADMIN_ROLES = new Set(["super_admin", "exec_admin", "admin"]);

/**
 * Rip → transcribe → analyze, driven from the promo feed.
 *
 * VidRipper already owns the whole pipeline (yt-dlp → Rev.com → Promo Analyzer),
 * so this is a thin proxy that forwards the caller's OxfordHub cookie — that
 * cookie is what attributes the rip and the resulting review to the right user.
 */

/** Forward the browser's hub session so VidRipper attributes the job correctly. */
async function hubCookie(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-cookies") || h.get("cookie") || "";
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.has(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const promo = await prisma.promo.findUnique({ where: { id } });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (promo.vidripperJobId) return advance(promo.id, promo.vidripperJobId, await hubCookie());

  let res: Response;
  try {
    res = await fetch(`${VIDRIPPER_URL}/api/rip`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await hubCookie() },
      body: JSON.stringify({ url: promo.landingUrl, page_url: promo.landingUrl }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "VidRipper unreachable";
    await prisma.promo.update({ where: { id }, data: { vidripperStatus: "error", vidripperError: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
    duplicate?: boolean;
    existing_job?: { id?: string };
  };
  const jobId = data.id ?? data.existing_job?.id;

  if (!res.ok || !jobId) {
    const message = data.error ?? `VidRipper returned ${res.status}`;
    await prisma.promo.update({ where: { id }, data: { vidripperStatus: "error", vidripperError: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await prisma.promo.update({
    where: { id },
    data: {
      vidripperJobId: jobId,
      vidripperStatus: "ripping",
      vidripperError: null,
      ripRequestedAt: new Date(),
      ripRequestedBy: user.email,
    },
  });

  return advance(id, jobId, await hubCookie());
}

/** Poll — also nudges the pipeline to its next stage when one completes. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const promo = await prisma.promo.findUnique({ where: { id } });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!promo.vidripperJobId) return NextResponse.json({ status: null });
  return advance(promo.id, promo.vidripperJobId, await hubCookie());
}

const RIPPING_STEPS = new Set(["queued", "fetching_page", "fetching_page_rendered", "downloading_video", "taking_screenshot"]);

async function advance(promoId: string, jobId: string, cookie: string) {
  let job: {
    pipeline_step?: string;
    transcript_text?: string;
    analyze_status?: string;
    promo_review_id?: string;
    error?: string;
    title?: string;
  };
  try {
    const res = await fetch(`${VIDRIPPER_URL}/api/jobs/${jobId}`, { headers: { cookie }, cache: "no-store" });
    if (!res.ok) throw new Error(`job lookup returned ${res.status}`);
    job = await res.json();
  } catch (err) {
    return NextResponse.json({ jobId, status: "error", error: err instanceof Error ? err.message : "poll failed" });
  }

  const step = job.pipeline_step ?? "queued";
  let status = "ripping";
  let reviewId = job.promo_review_id ?? null;

  if (job.promo_review_id) {
    status = "done";
  } else if (step === "failed") {
    status = "error";
  } else if (RIPPING_STEPS.has(step)) {
    status = "ripping";
  } else if (!job.transcript_text) {
    // Video is down; Rev is still working. Hitting /transcript is what pulls a
    // finished transcript back from Rev onto the job.
    status = "transcribing";
    try {
      const t = await fetch(`${VIDRIPPER_URL}/api/jobs/${jobId}/transcript`, { headers: { cookie }, cache: "no-store" });
      const td = (await t.json().catch(() => ({}))) as { transcript?: string };
      if (td.transcript) job.transcript_text = td.transcript;
    } catch {
      /* still transcribing — try again on the next poll */
    }
  }

  if (!reviewId && job.transcript_text && step !== "failed") {
    if (job.analyze_status === "analyzing") {
      status = "analyzing";
    } else {
      try {
        const a = await fetch(`${VIDRIPPER_URL}/api/jobs/${jobId}/analyze-proxy`, {
          method: "POST",
          headers: { cookie },
        });
        const ad = (await a.json().catch(() => ({}))) as { status?: string; review_id?: string };
        reviewId = ad.review_id ?? null;
        status = reviewId ? "done" : "analyzing";
      } catch {
        status = "analyzing";
      }
    }
  }

  await prisma.promo.update({
    where: { id: promoId },
    data: {
      vidripperStatus: status,
      promoReviewId: reviewId,
      vidripperError: status === "error" ? (job.error ?? "VidRipper pipeline failed") : null,
    },
  });

  return NextResponse.json({
    jobId,
    status,
    step,
    reviewId,
    error: status === "error" ? (job.error ?? "VidRipper pipeline failed") : null,
    jobUrl: `${VIDRIPPER_URL}/?job=${jobId}`,
    reviewUrl: reviewId ? `${ANALYZER_URL}/?review=${reviewId}` : null,
  });
}
