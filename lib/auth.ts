/**
 * iSpyEmails Auth — delegates entirely to OxfordHub
 * Uses /api/me with forwarded session cookie (same pattern as hub-nav.js)
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

const OXFORDHUB_URL = process.env.OXFORDHUB_URL ?? "https://oxfordhub.app";
const PROJECT_ID = "cmq1by18o0002ncdujwyk8b60";

export interface HubUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export async function getSessionUser(): Promise<HubUser | null> {
  try {
    const h = await headers();
    const cookieHeader = h.get("x-forwarded-cookies") || h.get("cookie") || "";

    if (!cookieHeader) return null;

    const res = await fetch(
      `${OXFORDHUB_URL}/api/me?projectId=${PROJECT_ID}`,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.authenticated || !data.authorized || !data.user) return null;

    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name ?? null,
      role: data.user.role ?? "user",
    };
  } catch (err) {
    console.error("[auth] error:", err);
    return null;
  }
}

export async function requireUser(): Promise<HubUser> {
  const user = await getSessionUser();
  if (!user) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "ispy.oxfordhub.app";
    const proto = h.get("x-forwarded-proto") ?? "https";
    redirect(`${OXFORDHUB_URL}/login?callbackUrl=${encodeURIComponent(`${proto}://${host}`)}`);
  }
  return user;
}
