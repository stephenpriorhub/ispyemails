/** Read-only diagnostic for guru↔list data quality. Prints; changes nothing. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1) Chaikin / Chaiken — any spelling
  const chaik = await prisma.guru.findMany({
    where: { name: { contains: "Chaik", mode: "insensitive" } },
    include: {
      publisher: { select: { name: true } },
      lists: { where: { isIgnored: false }, include: { list: { select: { name: true, category: true, publisher: { select: { name: true } } } } } },
    },
  });
  console.log("── Chaikin/Chaiken matches ──");
  for (const g of chaik) {
    console.log(`  ${g.name} — publisher: ${g.publisher?.name ?? "(none)"}; lists: ${g.lists.map(l => `${l.list.name} [${l.list.category}] / ${l.list.publisher?.name ?? "?"}`).join(", ") || "(none)"}`);
  }
  if (!chaik.length) console.log("  (no match)");

  // 2) Chaikin Analytics publisher + its lists
  const cap = await prisma.publisher.findFirst({
    where: { name: { contains: "Chaik", mode: "insensitive" } },
    include: { lists: { select: { name: true, category: true } } },
  });
  console.log(`\n── Chaikin Analytics publisher ──\n  ${cap ? `${cap.name}: lists = ${cap.lists.map(l => `${l.name} [${l.category}]`).join(", ") || "(none)"}` : "(no publisher match)"}`);

  // 3) Which gurus are sourced ONLY from marketing-file / affiliate emails?
  //    (guru → EmailGuru → Email → Publisher.type). These are marketing-file gurus.
  const gurus = await prisma.guru.findMany({
    where: { isIgnored: false, isSecondaryVoice: false },
    select: {
      name: true,
      publisherId: true,
      lists: { where: { isIgnored: false }, select: { listId: true } },
      emails: { select: { email: { select: { publisher: { select: { type: true, name: true } }, list: { select: { category: true } } } } } },
    },
  });
  const marketingOnly = [];
  for (const g of gurus) {
    if (!g.emails.length) continue;
    const allMarketing = g.emails.every(e =>
      e.email.publisher?.type === "AFFILIATE_MARKETER" || e.email.list?.category === "MARKETING_FILE",
    );
    if (allMarketing) {
      const pubs = [...new Set(g.emails.map(e => e.email.publisher?.name).filter(Boolean))];
      marketingOnly.push(`${g.name} (${g.emails.length} emails, from: ${pubs.join("/")})`);
    }
  }
  console.log(`\n── Gurus sourced ONLY from marketing-file/affiliate emails: ${marketingOnly.length} ──`);
  console.log("  " + (marketingOnly.join("\n  ") || "(none)"));
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
