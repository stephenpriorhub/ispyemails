import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const ADMIN_ROLES = new Set(["super_admin", "exec_admin", "admin"]);
const KINDS = new Set(["VSL", "LEAD_GEN", "EQUITY_RAISE"]);

/** Correct an auto-derived headline, advertiser, or classification. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.has(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as {
    headline?: string;
    advertiser?: string;
    kind?: string;
    advertiserIsInternal?: boolean;
  };

  const promo = await prisma.promo.findUnique({
    where: { id },
    select: { advertiserId: true, advertiser: { select: { isPlatform: true } } },
  });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const promoData: { headline?: string; headlineSource?: string; kind?: string; advertiserLabel?: string } = {};

  if (typeof body.headline === "string") {
    const headline = body.headline.trim();
    if (!headline) return NextResponse.json({ error: "headline cannot be empty" }, { status: 400 });
    promoData.headline = headline;
    promoData.headlineSource = "MANUAL"; // keeps the next scan from overwriting it
  }

  if (typeof body.kind === "string") {
    if (!KINDS.has(body.kind)) return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    promoData.kind = body.kind;
  }

  if (typeof body.advertiser === "string" && body.advertiser.trim()) {
    const label = body.advertiser.trim();
    if (promo.advertiser.isPlatform) {
      // zoom.us hosts many advertisers' funnels — naming one must not rename the rest.
      promoData.advertiserLabel = label;
    } else {
      await prisma.promoAdvertiser.update({
        where: { id: promo.advertiserId },
        data: { label, labelConfirmed: true },
      });
    }
  }

  if (typeof body.advertiserIsInternal === "boolean") {
    await prisma.promoAdvertiser.update({
      where: { id: promo.advertiserId },
      data: { isInternal: body.advertiserIsInternal },
    });
  }

  if (Object.keys(promoData).length) await prisma.promo.update({ where: { id }, data: promoData });

  const updated = await prisma.promo.findUnique({
    where: { id },
    include: { advertiser: { select: { id: true, label: true, domain: true, isInternal: true, isPlatform: true } } },
  });
  return NextResponse.json(updated);
}
