/**
 * Reconcile guru↔publisher↔list data to the agreed rules. Dry-run by default.
 *
 *   Phase 1  Exclude marketing-file gurus — a guru whose emails come ONLY from
 *            marketing-file / affiliate-marketer publications (e.g. MarketBeat)
 *            is promo bait, not an editor. Ignored by default (reversible), or
 *            hard-deleted with --delete-marketing. Also strips any GuruList rows
 *            on MARKETING_FILE lists.
 *   Phase 2  Remove cross-publisher memberships — a guru assigned to a publisher
 *            may only be a member of that publisher's lists (or a manually-set
 *            secondary publisher's). Everything else is promotion, not membership.
 *   Phase 3  Fix orphans — every guru assigned to a publisher must be on a list.
 *            If he has no active membership and his publisher has exactly ONE
 *            editorial list, link him to it. Ambiguous cases are reported.
 *   Phase 4  Report any guru still orphaned (for manual attention).
 *
 * Run:
 *   DATABASE_URL=... node scripts/reconcile-gurus.mjs                    # dry run
 *   DATABASE_URL=... node scripts/reconcile-gurus.mjs --apply            # execute (ignore marketing gurus)
 *   DATABASE_URL=... node scripts/reconcile-gurus.mjs --apply --delete-marketing  # hard-delete marketing gurus
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");
const deleteMarketing = process.argv.includes("--delete-marketing");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const tag = apply ? "APPLY" : "DRY RUN";

async function phase1_marketingGurus() {
  console.log(`\n═══ Phase 1 · Marketing-file gurus [${tag}] ═══`);
  const gurus = await prisma.guru.findMany({
    where: { isIgnored: false },
    select: {
      id: true, name: true, publisherId: true,
      emails: { select: { email: { select: { publisher: { select: { type: true, name: true } }, list: { select: { category: true } } } } } },
    },
  });
  // A guru is "marketing-only" if he has emails and every one is from an affiliate
  // marketer / marketing file, AND he has not been manually assigned a publisher.
  const marketing = gurus.filter(g =>
    !g.publisherId && g.emails.length > 0 &&
    g.emails.every(e => e.email.publisher?.type === "AFFILIATE_MARKETER" || e.email.list?.category === "MARKETING_FILE"),
  );
  console.log(`Found ${marketing.length} marketing-only guru(s) to ${deleteMarketing ? "DELETE" : "IGNORE"}:`);
  for (const g of marketing) console.log(`  ✗ ${g.name} (${g.emails.length} emails)`);

  // Any GuruList rows sitting on MARKETING_FILE lists (belt-and-suspenders).
  const mfListIds = (await prisma.list.findMany({ where: { category: "MARKETING_FILE" }, select: { id: true } })).map(l => l.id);
  const mfMemberships = mfListIds.length ? await prisma.guruList.count({ where: { listId: { in: mfListIds } } }) : 0;
  console.log(`Plus ${mfMemberships} GuruList membership(s) on MARKETING_FILE lists to remove.`);

  if (apply) {
    for (const g of marketing) {
      if (deleteMarketing) await prisma.guru.delete({ where: { id: g.id } });
      else await prisma.guru.update({ where: { id: g.id }, data: { isIgnored: true } });
    }
    if (mfListIds.length) await prisma.guruList.deleteMany({ where: { listId: { in: mfListIds } } });
    console.log(`✓ ${deleteMarketing ? "Deleted" : "Ignored"} ${marketing.length} guru(s); removed ${mfMemberships} marketing-file membership(s).`);
  }
}

async function phase2_crossPublisher() {
  console.log(`\n═══ Phase 2 · Cross-publisher memberships [${tag}] ═══`);
  const links = await prisma.guruList.findMany({
    where: { guru: { publisherId: { not: null } }, list: { publisherId: { not: null } } },
    include: {
      guru: { select: { name: true, publisherId: true, secondaryPublishers: { select: { publisherId: true } } } },
      list: { select: { name: true, publisherId: true, publisher: { select: { name: true } } } },
    },
  });
  const violations = links.filter(l => {
    const allowed = new Set([l.guru.publisherId, ...l.guru.secondaryPublishers.map(sp => sp.publisherId)]);
    return !allowed.has(l.list.publisherId);
  });
  console.log(`Found ${violations.length} cross-publisher membership(s) to remove:`);
  for (const v of violations) console.log(`  ✗ ${v.guru.name} — "${v.list.name}" (${v.list.publisher?.name}) → promotion, not membership`);
  if (apply) {
    for (const v of violations) await prisma.guruList.delete({ where: { guruId_listId: { guruId: v.guruId, listId: v.listId } } });
    console.log(`✓ Removed ${violations.length} cross-publisher membership(s).`);
  }
}

async function phase3_orphanFix() {
  console.log(`\n═══ Phase 3 · Assign publisher-orphans to their list [${tag}] ═══`);
  const gurus = await prisma.guru.findMany({
    where: { isIgnored: false, isSecondaryVoice: false, publisherId: { not: null } },
    select: {
      id: true, name: true, publisherId: true,
      publisher: { select: { name: true, lists: { where: { isIgnored: false, category: { not: "MARKETING_FILE" } }, select: { id: true, name: true } } } },
      lists: { where: { isIgnored: false }, select: { listId: true } },
    },
  });
  const orphans = gurus.filter(g => g.lists.length === 0);
  let linked = 0;
  for (const g of orphans) {
    const editorialLists = g.publisher?.lists ?? [];
    if (editorialLists.length === 1) {
      console.log(`  → ${g.name}: link to "${editorialLists[0].name}" (${g.publisher?.name})`);
      if (apply) { await prisma.guruList.create({ data: { guruId: g.id, listId: editorialLists[0].id, isPrimary: true } }); linked++; }
    } else if (editorialLists.length === 0) {
      console.log(`  ⚠ ${g.name}: publisher ${g.publisher?.name} has NO editorial list — needs a list created first`);
    } else {
      console.log(`  ⚠ ${g.name}: publisher ${g.publisher?.name} has ${editorialLists.length} lists — assign manually: ${editorialLists.map(l => l.name).join(", ")}`);
    }
  }
  if (apply) console.log(`✓ Auto-linked ${linked} orphan(s) to their publisher's sole editorial list.`);
}

async function phase4_remainingOrphans() {
  console.log(`\n═══ Phase 4 · Remaining orphans (manual attention) ═══`);
  const gurus = await prisma.guru.findMany({
    where: { isIgnored: false, isSecondaryVoice: false },
    select: { name: true, publisher: { select: { name: true } }, lists: { where: { isIgnored: false }, select: { listId: true } } },
  });
  const orphans = gurus.filter(g => g.lists.length === 0);
  console.log(`${orphans.length} guru(s) still have no list:`);
  for (const g of orphans) console.log(`  • ${g.name}${g.publisher ? ` (${g.publisher.name})` : " — NO PUBLISHER"}`);
}

async function main() {
  await phase1_marketingGurus();
  await phase2_crossPublisher();
  await phase3_orphanFix();
  await phase4_remainingOrphans();
  if (!apply) console.log(`\n${tag} — nothing changed. Re-run with --apply to execute (add --delete-marketing to hard-delete marketing gurus).`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
