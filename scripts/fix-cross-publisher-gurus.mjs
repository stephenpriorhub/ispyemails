/**
 * One-time backfill: remove cross-publisher guru → list memberships.
 *
 * Rule (see lib/analyze.ts `guruMayJoinList`): a guru who is ASSIGNED to a
 * publisher (guru.publisherId set) may only be a MEMBER of that publisher's
 * lists. If he shows up in another publisher's e-letter he is a guest / is
 * being promoted — that's a mention (EmailGuru), never a membership (GuruList).
 *
 * This finds GuruList rows where the list's publisher is NOT the guru's primary
 * publisher and NOT one of his (manually set) secondary publishers, and removes
 * them. Lists whose publisher is unknown (null) are LEFT ALONE — we can't prove a
 * violation there.
 *
 * Safe by default: prints what it WOULD delete and changes nothing.
 * Pass --apply to actually delete.
 *
 * Run:
 *   DATABASE_URL=... node scripts/fix-cross-publisher-gurus.mjs          # dry run
 *   DATABASE_URL=... node scripts/fix-cross-publisher-gurus.mjs --apply  # execute
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Only gurus that are actually assigned to a publisher can be in violation.
  const links = await prisma.guruList.findMany({
    where: {
      guru: { publisherId: { not: null } },
      list: { publisherId: { not: null } },
    },
    include: {
      guru: {
        select: {
          name: true,
          publisherId: true,
          publisher: { select: { name: true } },
          secondaryPublishers: { select: { publisherId: true } },
        },
      },
      list: { select: { name: true, publisherId: true, publisher: { select: { name: true } } } },
    },
  });

  const violations = links.filter((l) => {
    const allowed = new Set([l.guru.publisherId, ...l.guru.secondaryPublishers.map((sp) => sp.publisherId)]);
    return !allowed.has(l.list.publisherId);
  });

  if (violations.length === 0) {
    console.log("✓ No cross-publisher guru memberships found. Nothing to fix.");
    return;
  }

  console.log(`Found ${violations.length} cross-publisher membership(s) to remove:\n`);
  for (const v of violations) {
    console.log(
      `  ✗ ${v.guru.name} (assigned to ${v.guru.publisher?.name}) ` +
        `— membership in "${v.list.name}" (owned by ${v.list.publisher?.name}) → PROMOTION, not membership`,
    );
  }

  if (!apply) {
    console.log(`\nDRY RUN — nothing changed. Re-run with --apply to delete these ${violations.length} membership(s).`);
    return;
  }

  let deleted = 0;
  for (const v of violations) {
    await prisma.guruList.delete({ where: { guruId_listId: { guruId: v.guruId, listId: v.listId } } });
    deleted++;
  }
  console.log(`\n✓ Removed ${deleted} cross-publisher membership(s). Mentions (EmailGuru) are untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
