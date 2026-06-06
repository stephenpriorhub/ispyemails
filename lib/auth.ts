/**
 * iSpyEmails Auth — delegates entirely to OxfordHub
 *
 * Users log in at oxfordhub.app. The session cookie is scoped to
 * .oxfordhub.app so it is automatically available at ispy.oxfordhub.app.
 *
 * Verification: forward all cookies to oxfordhub.app/api/verify.
 * OxfordHub reads its own session cookie and returns the user.
 */

import { NextRequest } from "next/server";

const OXFORDHUB_URL = process.env.OXFORDHUB_URL ?? "https://oxfordhub.app";
const HUB_API_TOKEN = process.env.HUB_API_TOKEN ?? "";

export interface HubUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Verify a request is authenticated via OxfordHub.
 * Forwards all cookies so OxfordHub finds its session regardless of cookie name variant.
 */
export async function verifyHubSession(req: NextRequest): Promise<HubUser | null> {
  if (!HUB_API_TOKEN) {
    console.error("[auth] HUB_API_TOKEN not set");
    return null;
  }

  const cookieHeader = req.headers.get("cookie") ?? "";

  try {
    const res = await fetch(`${OXFORDHUB_URL}/api/verify`, {
      method: "GET",
      headers: {
        "x-hub-token": HUB_API_TOKEN,
        "cookie": cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[auth] verify returned", res.status);
      return null;
    }

    const data = await res.json();
    if (!data.authorized || !data.user) return null;

    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name ?? null,
      role: data.user.role ?? "user",
    };
  } catch (err) {
    console.error("[auth] verify error:", err);
    return null;
  }
}

/** URL to redirect unauthenticated users to */
export function loginUrl(callbackUrl: string): string {
  return `${OXFORDHUB_URL}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
