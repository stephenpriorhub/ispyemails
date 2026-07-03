/**
 * AI pass to keep ONLY investment topics. Dry-run by default.
 *
 * Topics should be investment subject matter usable in editorial or promos —
 * sectors, assets, macro themes, trading strategies, specific opportunities.
 * Marketing/funnel/lifestyle meta (event promotion, membership conversion,
 * subscription upsell, wealth diversity, financial freedom, guaranteed income)
 * is NOT a topic — the email's purpose is captured by emailType. This asks Claude
 * to classify every active topic and IGNORES the non-investment ones (reversible;
 * the analyzer already treats ignored topics as never-use).
 *
 * Run (needs ANTHROPIC_API_KEY in env — present on the Railway service):
 *   DATABASE_URL=... node scripts/classify-topics.mjs           # dry run
 *   DATABASE_URL=... node scripts/classify-topics.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Anthropic from "@anthropic-ai/sdk";

const apply = process.argv.includes("--apply");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const topics = await prisma.topic.findMany({
    where: { isIgnored: false },
    select: { id: true, name: true, _count: { select: { emails: true } } },
  });
  const names = topics.map(t => t.name);

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `A financial publisher tags competitor emails with "topics". A valid topic is INVESTMENT SUBJECT MATTER that could headline editorial or a promo: sectors, asset classes, macro/geopolitical themes, trading strategies, or specific opportunities (e.g. "artificial intelligence", "uranium", "options income", "Fed policy", "small-cap stocks", "pre-IPO", "sector rotation").

NOT valid topics (marketing mechanics, funnel stages, or lifestyle/aspiration framing): e.g. "event promotion", "membership conversion", "subscription upsell", "wealth diversity", "financial freedom", "guaranteed income", "paid research access", "negotiation strategy".

From the list below, return ONLY the ones that are NOT valid investment topics.
Reply with a JSON array of the exact strings to remove, nothing else.

TOPICS:
${names.join("\n")}`,
    }],
  });

  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) { console.log("Could not parse model response:\n" + text); return; }
  const remove = new Set(JSON.parse(match[0]).map(s => String(s).toLowerCase()));
  const toIgnore = topics.filter(t => remove.has(t.name.toLowerCase())).sort((a, b) => b._count.emails - a._count.emails);

  console.log(`Claude flagged ${toIgnore.length} of ${topics.length} topics as NON-investment (to ignore):\n`);
  toIgnore.forEach(t => console.log(`  ${String(t._count.emails).padStart(4)}  ${t.name}`));

  if (!apply) {
    console.log(`\nDRY RUN — nothing changed. Re-run with --apply to ignore these ${toIgnore.length} topics.`);
    return;
  }
  if (toIgnore.length) await prisma.topic.updateMany({ where: { id: { in: toIgnore.map(t => t.id) } }, data: { isIgnored: true } });
  console.log(`\n✓ Ignored ${toIgnore.length} non-investment topics. Run seed-secondary-topics.mjs next to tier the rest.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
