/**
 * One-off Promo Radar cleanup (2026-10-30).
 *
 *  1. Delete stored "promos" that aren't promos — subscription centers, bot
 *     walls, view-in-browser pages, status pages (the new scan gate rejects them).
 *  2. Fingerprint every remaining promo (root domain + on-page headline) and
 *     merge the per-send URL variants of one page into a single promo.
 *
 * Dry run by default. `--apply` to write.
 *   DATABASE_URL=<public url> npx tsx scripts/backfill-promo-dedupe.ts [--apply]
 */
import { prisma } from "../lib/prisma";
import { canonicalKey, contentKey, isNotAPromo, rootDomain } from "../lib/promo-links";

const APPLY = process.argv.includes("--apply");

async function main() {
  const promos = await prisma.promo.findMany({
    include: {
      advertiser: { select: { label: true, isPlatform: true, publisherId: true } },
      sightings: { select: { id: true, emailId: true, day: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${promos.length} promos`);

  // 1. Not a promo. A bare homepage counts as junk when the same advertiser also
  // has real promo paths AND the domain is a known publisher's own site — it's the
  // logo link. Dedicated promo domains (elonsphase2.com/) keep their root page (the live scan checks
  // the page for a VSL / opt-in instead; we don't have the HTML here).
  const isBareHome = (u: string) => {
    try { return new URL(u).pathname.replace(/\/+$/, "") === ""; } catch { return false; }
  };
  const advertisersWithPaths = new Set(promos.filter((p) => !isBareHome(p.landingUrl)).map((p) => p.advertiserId));
  const junk = promos.filter(
    (p) => isNotAPromo(p.landingUrl, p.headline) || (isBareHome(p.landingUrl) && !!p.advertiser.publisherId && advertisersWithPaths.has(p.advertiserId)),
  );
  const byHeadline = new Map<string, number>();
  for (const p of junk) byHeadline.set(p.headline ?? p.canonicalKey, (byHeadline.get(p.headline ?? p.canonicalKey) ?? 0) + 1);
  console.log(`\nNOT A PROMO: ${junk.length}`);
  for (const [h, n] of [...byHeadline].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${h.slice(0, 90)}`);
  const junkIds = new Set(junk.map((p) => p.id));

  // 2. Fingerprint + group. Two promos are the same when they share the URL once
  // per-send ids are stripped (darwin_internal_id, emailjobid…) OR the same page
  // content. Union-find over both keys.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const firstByKey = new Map<string, string>();
  const link = (key: string, id: string) => {
    const seen = firstByKey.get(key);
    if (seen) union(seen, id); else firstByKey.set(key, id);
  };
  const keyOf = new Map<string, string | null>();
  for (const p of promos) {
    if (junkIds.has(p.id)) continue;
    const ck = contentKey({
      rootDomain: rootDomain(p.landingHost),
      host: p.landingHost,
      headline: p.headline,
      headlineSource: p.headlineSource,
      siteName: p.advertiser.label,
      isPlatform: p.advertiser.isPlatform,
    });
    keyOf.set(p.id, ck);
    parent.set(p.id, p.id);
    link(`url:${canonicalKey(p.landingUrl)}`, p.id);
    if (ck) link(`content:${ck}`, p.id);
  }
  const groups = new Map<string, typeof promos>();
  for (const p of promos) {
    if (junkIds.has(p.id)) continue;
    const root = find(p.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(p);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  const merged = dupGroups.reduce((n, g) => n + g.length - 1, 0);
  console.log(`\nDUPLICATES: ${dupGroups.length} pages appeared under ${merged + dupGroups.length} URLs → merge ${merged}`);
  for (const g of dupGroups.slice(0, 40)) console.log(`  ${String(g.length).padStart(3)}× ${g[0].advertiser.label} — ${(g[0].headline ?? "").slice(0, 70)}`);
  console.log(`\nResult: ${promos.length} → ${promos.length - junk.length - merged} promos`);

  if (!APPLY) {
    console.log("\n(dry run — pass --apply to write)");
    return;
  }

  await prisma.promo.deleteMany({ where: { id: { in: [...junkIds] } } });

  for (const [id, ck] of keyOf) if (ck) await prisma.promo.update({ where: { id }, data: { contentKey: ck } });

  for (const group of dupGroups) {
    // Keep the copy that carries human or pipeline work; otherwise the oldest.
    const keeper =
      group.find((p) => p.promoReviewId) ??
      group.find((p) => p.vidripperJobId) ??
      group.find((p) => p.headlineSource === "MANUAL") ??
      group[0];
    const others = group.filter((p) => p.id !== keeper.id);
    const keeperEmails = new Set(keeper.sightings.map((s) => s.emailId));

    await prisma.$transaction(async (tx) => {
      for (const o of others) {
        for (const s of o.sightings) {
          if (keeperEmails.has(s.emailId)) continue; // same email already counted
          keeperEmails.add(s.emailId);
          await tx.promoSighting.update({ where: { id: s.id }, data: { promoId: keeper.id } });
        }
      }
      await tx.promo.deleteMany({ where: { id: { in: others.map((o) => o.id) } } });

      // Span + "first ever" now come from the merged sightings.
      const rows = await tx.promoSighting.findMany({
        where: { promoId: keeper.id },
        select: { id: true, day: true, createdAt: true },
        orderBy: [{ day: "asc" }, { createdAt: "asc" }],
      });
      const days = [...new Set(rows.map((r) => r.day.toISOString()))];
      await tx.promoSighting.updateMany({ where: { promoId: keeper.id }, data: { isFirstEver: false } });
      await tx.promoSighting.update({ where: { id: rows[0].id }, data: { isFirstEver: true } });
      await tx.promo.update({
        where: { id: keeper.id },
        data: { daysDetected: days.length, firstSeenOn: rows[0].day, lastSeenOn: rows[rows.length - 1].day },
      });
    });
  }
  console.log(`\nApplied. ${await prisma.promo.count()} promos remain.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
