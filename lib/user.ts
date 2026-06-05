/**
 * Read the current user from request headers (set by middleware).
 * Use this in Server Components.
 */
import { headers } from "next/headers";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const h = await headers();
  const id = h.get("x-user-id");
  if (!id) return null;
  return {
    id,
    email: h.get("x-user-email") ?? "",
    name: h.get("x-user-name") ?? "",
    role: h.get("x-user-role") ?? "user",
  };
}
