export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getServerIsAdmin } from "@/lib/server-role";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const [isAdmin, sp] = await Promise.all([getServerIsAdmin(), searchParams]);
  return (
    <SettingsClient
      accounts={await prisma.gmailAccount.findMany({ select: { email: true, isActive: true, lastSyncAt: true, historyId: true } })}
      connected={sp.connected === "true"}
      error={sp.error}
      isAdmin={isAdmin}
    />
  );
}
