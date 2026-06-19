import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeEmail } from "@/lib/analyze";

/**
 * POST /api/reclassify-unknown
 *
 * Finds all emails with emailType = UNKNOWN (legacy) and re-runs full classification.
 * Safe to call multiple times — already-classified emails are skipped.
 */
export async function POST() {
  const unknownEmails = await prisma.email.findMany({
    where: { emailType: "UNKNOWN" },
    select: {
      id: true,
      subject: true,
      fromName: true,
      fromEmail: true,
      toEmail: true,
      bodyText: true,
      bodyHtml: true,
    },
    take: 100, // batch cap to avoid timeouts
  });

  let reclassified = 0;
  let errors = 0;

  for (const email of unknownEmails) {
    try {
      await analyzeEmail(
        email.id,
        email.subject,
        email.fromName ?? "",
        email.fromEmail,
        email.bodyText,
        email.bodyHtml,
        email.toEmail
      );
      reclassified++;
    } catch (err) {
      console.error(`[reclassify-unknown] Failed [${email.id}]:`, err);
      // Force to EDITORIAL as safe default
      await prisma.email.update({
        where: { id: email.id },
        data: { emailType: "EDITORIAL", isProcessed: true },
      });
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    found: unknownEmails.length,
    reclassified,
    errors,
    message: unknownEmails.length === 0
      ? "No UNKNOWN emails found — all emails are classified."
      : `Reclassified ${reclassified} emails (${errors} forced to EDITORIAL after error).`,
  });
}
