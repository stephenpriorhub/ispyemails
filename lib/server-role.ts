import { cookies } from "next/headers";

const ADMIN_ROLES = new Set(["super_admin", "exec_admin", "admin"]);

/** Read the role cookie set by ClientAuthProvider after client-side auth */
export async function getServerIsAdmin(): Promise<boolean> {
  const c = await cookies();
  const role = c.get("ispy-role")?.value;
  return ADMIN_ROLES.has(role ?? "");
}
