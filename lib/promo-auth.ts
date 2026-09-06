import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

const ADMIN_ROLES = new Set(["super_admin", "exec_admin", "admin"]);

/**
 * Promo jobs make outbound requests and write to the DB, so the trigger routes
 * are gated: an OxfordHub admin session, or the cron secret for machine callers.
 */
export async function requireAdminOrCron(req: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const presented = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
    if (presented === secret) return null;
  }
  const user = await getSessionUser();
  if (user && ADMIN_ROLES.has(user.role)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
