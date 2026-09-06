import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const ADMIN_ROLES = new Set(["super_admin", "exec_admin", "admin"]);

/** Correct an auto-derived headline, or relabel the advertiser behind a domain. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.has(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { headline?: string; advertiserLabel?: string; advertiserIsInternal?: boolean };

  const promo = await prisma.promo.findUnique({ where: { id }, select: { advertiserId: true } });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (typeof body.headline === "string") {
    const headline = body.headline.trim();
    if (!headline) return NextResponse.json({ error: "headline cannot be empty" }, { status: 400 });
    // MANUAL keeps the next scan from overwriting it.
    await prisma.promo.update({ where: { id }, data: { headline, headlineSource: "MANUAL" } });
  }

  // The label belongs to the domain, so fixing it here fixes every promo on it.
  const advertiserData: { label?: string; labelConfirmed?: boolean; isInternal?: boolean } = {};
  if (typeof body.advertiserLabel === "string" && body.advertiserLabel.trim()) {
    advertiserData.label = body.advertiserLabel.trim();
    advertiserData.labelConfirmed = true;
  }
  if (typeof body.advertiserIsInternal === "boolean") advertiserData.isInternal = body.advertiserIsInternal;
  if (Object.keys(advertiserData).length) {
    await prisma.promoAdvertiser.update({ where: { id: promo.advertiserId }, data: advertiserData });
  }

  const updated = await prisma.promo.findUnique({
    where: { id },
    include: { advertiser: { select: { id: true, label: true, domain: true, isInternal: true } } },
  });
  return NextResponse.json(updated);
}
