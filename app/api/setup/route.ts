import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Seeds known financial publishers. Safe to call multiple times (upsert).
export async function POST() {
  const publishers = [
    { name: "Weiss Ratings", domains: ["weissratings.com", "weiss.com"], website: "https://weissratings.com" },
    { name: "Oxford Club", domains: ["oxfordclub.com", "pro.oxfordclub.com"], website: "https://oxfordclub.com" },
    { name: "InvestorPlace", domains: ["investorplace.com", "secure.investorplace.com"], website: "https://investorplace.com" },
    { name: "Paradigm Press", domains: ["paradigmnewsletters.org", "pro.paradigmnewsletters.org"], website: "https://paradigmnewsletters.org" },
    { name: "Altimetry", domains: ["altimetry.com", "secure.altimetry.com"], website: "https://altimetry.com" },
    { name: "Behind the Markets", domains: ["behindthemarkets.com", "colossus.behindthemarkets.com"], website: "https://behindthemarkets.com" },
    { name: "Banyan Hill", domains: ["banyanhill.com", "mb.banyanhill.com"], website: "https://banyanhill.com" },
    { name: "Stansberry Research", domains: ["stansberryresearch.com"], website: "https://stansberryresearch.com" },
    { name: "Agora Financial", domains: ["agorafinancial.com"], website: "https://agorafinancial.com" },
    { name: "Legacy Research", domains: ["legacyresearch.com"], website: "https://legacyresearch.com" },
    { name: "Porter & Company", domains: ["porterandcompanyresearch.com"], website: "https://porterandcompanyresearch.com" },
    { name: "Monument Traders Alliance", domains: ["monumenttradersalliance.com", "mtatradeoftheday.com", "mb.mtatradeoftheday.com"], website: "https://monumenttradersalliance.com" },
    { name: "Market Rebellion", domains: ["marketrebellion.com"], website: "https://marketrebellion.com" },
    { name: "Brownstone Research", domains: ["brownstoneresearch.com", "e.brownstoneresearch.com"], website: "https://brownstoneresearch.com" },
    { name: "TradeSmith", domains: ["tradesmith.com", "exct.tradesmith.com"], website: "https://tradesmith.com" },
    { name: "Tim Sykes", domains: ["timsykes.com", "email.timsykes.com", "email2.timsykeswatchlist.com"], website: "https://timothysykes.com" },
    { name: "Daily Reckoning", domains: ["dailyreckoning.com", "email.paradigmpressgroup.com"], website: "https://dailyreckoning.com" },
    { name: "Navellier & Associates", domains: ["navellier.com"], website: "https://navellier.com" },
  ];

  let seeded = 0;
  for (const pub of publishers) {
    await prisma.publisher.upsert({
      where: { name: pub.name },
      update: { domains: pub.domains, website: pub.website },
      create: { ...pub, knownFromAddresses: [], isConfirmed: true },
    });
    seeded++;
  }

  return NextResponse.json({ ok: true, seeded });
}
