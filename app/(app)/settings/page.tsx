export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUser, isAdminRole } from "@/lib/auth";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
  const sp = await searchParams;
  return (
    <SettingsClient
      accounts={await prisma.gmailAccount.findMany({ select: { email: true, isActive: true, lastSyncAt: true, historyId: true } })}
      connected={sp.connected === "true"}
      error={sp.error}
      isAdmin={isAdmin}
    />
  );
}
