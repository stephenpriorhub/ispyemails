/**
 * Auth gate for iSpy's API routes.
 *
 * WHY THIS EXISTS: iSpy's auth was done in the app layout (see lib/auth.ts
 * requireUser). A layout is a Server Component — it guards PAGES, and route
 * handlers never render it, so every /api/* route was reachable unauthenticated
 * from the internet: full email bodies readable, and ~28 mutating handlers
 * (including DELETE on emails, gurus, publishers, lists and learnings, plus
 * /api/cleanup and /api/sync) callable by anyone who knew the hostname.
 * middleware.ts does not gate either — it only forwards the cookie header.
 *
 * Gates are therefore ROUTE-LEVEL, which is the only layer route handlers
 * actually run through. Every new API route must call one of these.
 *
 * These take no arguments on purpose. iSpy handlers have a dozen different
 * signatures and 19 of them take no request object at all, so the gate reads
 * next/headers instead — one uniform call that fits every handler.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSessionUser, isAdminRole } from "@/lib/auth";

/** Machine callers: sibling OxfordHub apps (x-hub-token) and schedulers (x-cron-secret). */
async function isServiceCaller(): Promise<boolean> {
  const h = await headers();
  const hubToken = h.get("x-hub-token");
  if (hubToken && process.env.HUB_API_TOKEN && hubToken === process.env.HUB_API_TOKEN) return true;
  const cronSecret = h.get("x-cron-secret");
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) return true;
  return false;
}

/**
 * Local-dev bypass. Guarded by NODE_ENV so it can never take effect on Railway,
 * where NODE_ENV=production and the var is unset.
 */
function devBypass(): boolean {
  return process.env.NODE_ENV !== "production" && !!process.env.ISPY_DEV_AUTH;
}

function denied(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Any authenticated & authorized hub user. Use for reads — viewing competitor
 * intelligence is open to the team, matching what the pages allow.
 * Returns null when allowed, or a response to return directly.
 */
export async function requireApiUser(): Promise<NextResponse | null> {
  if (devBypass()) return null;
  if (await isServiceCaller()) return null;
  const user = await getSessionUser();
  if (!user) return denied("Sign in to OxfordHub to access iSpy.");
  return null;
}

/**
 * Hub admins only. Use for anything that writes, merges, reclassifies or
 * deletes. Fails closed: if the hub is unreachable, getSessionUser returns null
 * and the request is refused.
 */
export async function requireApiAdmin(): Promise<NextResponse | null> {
  if (devBypass()) return null;
  if (await isServiceCaller()) return null;
  const user = await getSessionUser();
  if (!user) return denied("Sign in to OxfordHub to access iSpy.");
  if (!isAdminRole(user.role)) return denied("This action is restricted to OxfordHub admins.");
  return null;
}
