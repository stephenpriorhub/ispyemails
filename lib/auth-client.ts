const ADMIN_ROLES = new Set(["super_admin", "exec_admin", "admin"]);

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.has(role ?? "");
}
