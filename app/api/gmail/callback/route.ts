import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/settings?error=no_code", req.url));
  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress!;
    await prisma.gmailAccount.upsert({ where: { email }, update: { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token ?? "", tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null, historyId: profile.data.historyId ?? null, isActive: true }, create: { email, accessToken: tokens.access_token!, refreshToken: tokens.refresh_token ?? "", tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null, historyId: profile.data.historyId ?? null } });
    return NextResponse.redirect(new URL("/settings?connected=true", req.url));
  } catch (err) { console.error(err); return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url)); }
}
