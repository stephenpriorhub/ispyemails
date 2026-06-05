/**
 * iSpyEmails Auth — delegates entirely to OxfordHub
 *
 * Users log in at oxfordhub.app. The session cookie is scoped to
 * .oxfordhub.app so it is automatically available at ispy.oxfordhub.app.
 *
 * We verify the session in two ways (in order of preference):
 *   1. Decode the NextAuth JWT locally using NEXTAUTH_SECRET (fast, no network)
 *   2. Call oxfordhub.app/api/verify with HUB_API_TOKEN (fallback)
 */

import { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

const OXFORDHUB_URL = process.env.OXFORDHUB_URL ?? "https://oxfordhub.app";
const HUB_API_TOKEN = process.env.HUB_API_TOKEN ?? "";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "";

export interface HubUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Verify a request is authenticated via OxfordHub.
 * Returns the user if authenticated, null if not.
 */
export async function verifyHubSession(req: NextRequest): Promise<HubUser | null> {
  // Try both cookie names (dev vs prod/HTTPS)
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) return null;

  // Path 1: Decode JWT locally if we have the shared secret (fast)
  if (NEXTAUTH_SECRET) {
    try {
      const decoded = await decode({
        token: sessionToken,
        secret: NEXTAUTH_SECRET,
        salt: process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      });
      if (decoded?.sub) {
        return {
          id: decoded.sub,
          email: decoded.email as string,
          name: decoded.name as string | null,
          role: (decoded.role as string) ?? "user",
        };
      }
    } catch {
      // Fall through to API verify
    }
  }

  // Path 2: Call oxfordhub.app/api/verify (slightly slower but always works)
  if (!HUB_API_TOKEN) return null;
  try {
    const res = await fetch(`${OXFORDHUB_URL}/api/verify`, {
      headers: {
        "x-hub-token": HUB_API_TOKEN,
        cookie: `authjs.session-token=${sessionToken}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.authorized || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name ?? null,
      role: data.user.role ?? "user",
    };
  } catch {
    return null;
  }
}

/** URL to redirect unauthenticated users to */
export function loginUrl(callbackUrl: string): string {
  return `${OXFORDHUB_URL}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
