/**
 * iSpyEmails Auth — delegates entirely to OxfordHub
 * Runs in Node.js runtime (Server Components / Route Handlers), not Edge.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

const OXFORDHUB_URL = process.env.OXFORDHUB_URL ?? "https://oxfordhub.app";
const HUB_API_TOKEN = process.env.HUB_API_TOKEN ?? "";

export interface HubUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Call from Server Components / layouts to get the current user.
 * Forwards cookies from the incoming request to OxfordHub's verify endpoint.
 * Returns null if not authenticated.
 */
export async function getSessionUser(): Promise<HubUser | null> {
  if (!HUB_API_TOKEN) {
    console.error("[auth] HUB_API_TOKEN not set");
    return null;
  }

  try {
    const h = await headers();
    // Use x-forwarded-cookies set by middleware, or fall back to cookie header
    const cookieHeader = h.get("x-forwarded-cookies") || h.get("cookie") || "";

    if (!cookieHeader) {
      console.log("[auth] No cookies in request");
      return null;
    }

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
    if (!data.authorized || !data.user) {
      console.log("[auth] not authorized:", JSON.stringify(data).substring(0, 100));
      return null;
    }

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

/**
 * Use in layouts/pages to require authentication.
 * Redirects to OxfordHub login if not authenticated.
 */
export async function requireUser(): Promise<HubUser> {
  const user = await getSessionUser();
  if (!user) {
    const h = await headers();
    const url = h.get("x-forwarded-host") ?? h.get("host") ?? "ispy.oxfordhub.app";
    const proto = h.get("x-forwarded-proto") ?? "https";
    redirect(`${OXFORDHUB_URL}/login?callbackUrl=${encodeURIComponent(`${proto}://${url}`)}`);
  }
  return user;
}
