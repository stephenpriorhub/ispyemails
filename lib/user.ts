// Re-export from auth for backwards compatibility
export type { HubUser as CurrentUser } from "@/lib/auth";
export { getSessionUser as getCurrentUser } from "@/lib/auth";
