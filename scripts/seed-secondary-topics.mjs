/**
 * One-time seed of the primary/secondary topic split. Dry-run by default.
 *
 * Significance ≈ email volume: a topic tagging many emails is a real category;
 * one tagging a handful is granular detail. This marks every topic below a
 * volume threshold as SECONDARY, leaving the high-volume ones PRIMARY. You then
 * refine by hand on the Topics page (Primary / Secondary buttons).
 *
 * Run:
 *   DATABASE_URL=... node scripts/seed-secondary-topics.mjs               # dry run, default threshold 10
 *   DATABASE_URL=... node scripts/seed-secondary-topics.mjs --min 15      # try a different threshold
 *   DATABASE_URL=... node scripts/seed-secondary-topics.mjs --min 15 --apply
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");
const minArg = process.argv.indexOf("--min");
const MIN_PRIMARY = minArg !== -1 ? Number(process.argv[minArg + 1]) : 10;
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const topics = await prisma.topic.findMany({
    where: { isIgnored: false },
    select: { id: true, name: true, isSecondary: true, _count: { select: { emails: true } } },
  });
  const withCount = topics.map(t => ({ id: t.id, name: t.name, isSecondary: t.isSecondary, c: t._count.emails }));

  const primary = withCount.filter(t => t.c >= MIN_PRIMARY).sort((a, b) => b.c - a.c);
  const secondary = withCount.filter(t => t.c < MIN_PRIMARY);

  console.log(`Threshold: a topic stays PRIMARY if it tags >= ${MIN_PRIMARY} emails.\n`);
  console.log(`PRIMARY (${primary.length}) — kept as significant categories:`);
  primary.forEach(t => console.log(`  ${String(t.c).padStart(4)}  ${t.name}`));
  console.log(`\nSECONDARY (${secondary.length}) — demoted to granular detail (showing 40):`);
  secondary.sort((a, b) => b.c - a.c).slice(0, 40).forEach(t => console.log(`  ${String(t.c).padStart(4)}  ${t.name}`));
  if (secondary.length > 40) console.log(`  … and ${secondary.length - 40} more`);

  const toDemote = secondary.filter(t => !t.isSecondary);
  const toPromote = primary.filter(t => t.isSecondary);
  console.log(`\nChanges: ${toDemote.length} → secondary, ${toPromote.length} → primary.`);

  if (!apply) {
    console.log(`\nDRY RUN — nothing changed. Re-run with --apply (optionally --min N to adjust).`);
    return;
  }
  if (toDemote.length) await prisma.topic.updateMany({ where: { id: { in: toDemote.map(t => t.id) } }, data: { isSecondary: true } });
  if (toPromote.length) await prisma.topic.updateMany({ where: { id: { in: toPromote.map(t => t.id) } }, data: { isSecondary: false } });
  console.log(`\n✓ Applied. Primary: ${primary.length}, Secondary: ${secondary.length}. Refine on the Topics page.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
