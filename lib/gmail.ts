import { google } from "googleapis";
import { prisma } from "./prisma";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.modify"];

export function getOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${process.env.NEXTAUTH_URL}/api/gmail/callback`);
}
export function getAuthUrl() {
  return getOAuthClient().generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });
}
export async function getAuthedClient(accountEmail: string) {
  const account = await prisma.gmailAccount.findUnique({ where: { email: accountEmail } });
  if (!account) throw new Error("Gmail account not found");
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: account.accessToken, refresh_token: account.refreshToken, expiry_date: account.tokenExpiry?.getTime() });
  oauth2Client.on("tokens", async (tokens) => {
    await prisma.gmailAccount.update({ where: { email: accountEmail }, data: { accessToken: tokens.access_token ?? account.accessToken, tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined } });
  });
  return oauth2Client;
}
export function placementFromLabels(labelIds: string[]): string {
  if (labelIds.includes("SPAM")) return "SPAM";
  if (labelIds.includes("CATEGORY_PROMOTIONS")) return "PROMOTIONS";
  // UPDATES and SOCIAL are treated as PRIMARY — these are inbox tabs, not junk
  if (labelIds.includes("CATEGORY_UPDATES")) return "PRIMARY";
  if (labelIds.includes("CATEGORY_SOCIAL")) return "PRIMARY";
  if (labelIds.includes("INBOX")) return "PRIMARY";
  return "UNKNOWN";
}
export function extractHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
export function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^"?([^"<]*)"?\s*<?([^>]+)?>?$/);
  if (match) return { name: match[1].trim(), email: match[2]?.trim() ?? from };
  return { name: "", email: from };
}
export function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf-8");
}
function findPart(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }, mimeType: string): string | null {
  if (payload.mimeType === mimeType && payload.body?.data) return decodeBody(payload.body.data);
  if (payload.parts) { for (const part of payload.parts as typeof payload[]) { const r = findPart(part, mimeType); if (r) return r; } }
  return null;
}
export function extractBodies(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): { html: string | null; text: string | null } {
  return { html: findPart(payload, "text/html"), text: findPart(payload, "text/plain") };
}
