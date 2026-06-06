import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // 1. Delete emails FROM the spy account itself
  const accounts = await prisma.gmailAccount.findMany({ select: { email: true } });
  const selfEmails = accounts.map((a) => a.email);
  const deleted = await prisma.email.deleteMany({
    where: { fromEmail: { in: selfEmails } },
  });

  // 2. Seed publishers
  const publishers = [
    { name: "Weiss Ratings", domains: ["weissratings.com", "weiss.com"] },
    { name: "Oxford Club", domains: ["oxfordclub.com", "pro.oxfordclub.com"] },
    { name: "InvestorPlace", domains: ["investorplace.com", "secure.investorplace.com"] },
    { name: "Paradigm Press", domains: ["paradigmnewsletters.org", "pro.paradigmnewsletters.org"] },
    { name: "Altimetry", domains: ["altimetry.com", "secure.altimetry.com"] },
    { name: "Behind the Markets", domains: ["behindthemarkets.com", "colossus.behindthemarkets.com"] },
    { name: "Banyan Hill", domains: ["banyanhill.com", "mb.banyanhill.com"] },
    { name: "Stansberry Research", domains: ["stansberryresearch.com"] },
    { name: "Agora Financial", domains: ["agorafinancial.com"] },
    { name: "Legacy Research", domains: ["legacyresearch.com"] },
    { name: "Porter & Company", domains: ["porterandcompanyresearch.com"] },
    { name: "Monument Traders Alliance", domains: ["monumenttradersalliance.com"] },
    { name: "Market Rebellion", domains: ["marketrebellion.com"] },
    { name: "Brownstone Research", domains: ["brownstoneresearch.com", "e.brownstoneresearch.com"] },
    { name: "TradeSmith", domains: ["tradesmith.com", "exct.tradesmith.com"] },
    { name: "Tim Sykes", domains: ["timsykes.com", "email.timsykes.com", "email2.timsykeswatchlist.com"] },
    { name: "Daily Reckoning", domains: ["dailyreckoning.com", "email.paradigmpressgroup.com"] },
    { name: "Navellier & Associates", domains: ["navellier.com"] },
  ];

  let seeded = 0;
  for (const pub of publishers) {
    await prisma.publisher.upsert({
      where: { name: pub.name },
      update: { domains: pub.domains },
      create: { ...pub, knownFromAddresses: [], isConfirmed: true },
    });
    seeded++;
  }

  // 3. Reset ALL emails to unprocessed so AI re-analyzes with new list/guru detection
  await prisma.email.updateMany({ data: { isProcessed: false } });

  // 4. Re-assign existing emails to matching publishers by domain
  const allPublishers = await prisma.publisher.findMany();
  const allEmails = await prisma.email.findMany({ select: { id: true, fromEmail: true, publisherId: true } });
  let matched = 0;
  for (const email of allEmails) {
    const domain = email.fromEmail.split("@")[1] ?? "";
    const pub = allPublishers.find((p) =>
      p.domains.some((d) => domain === d || domain.endsWith("." + d))
    );
    if (pub && pub.id !== email.publisherId) {
      await prisma.email.update({
        where: { id: email.id },
        data: { publisherId: pub.id, publisherConfirmed: true },
      });
      matched++;
    }
  }

  return NextResponse.json({ ok: true, deletedSelfEmails: deleted.count, publishersSeeded: seeded, emailsReset: allEmails.length, emailsMatched: matched });
}
