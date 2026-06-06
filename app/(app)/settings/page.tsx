export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { requireUser, isAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/");

  const sp = await searchParams;
  return <SettingsClient accounts={await prisma.gmailAccount.findMany({ select: { email: true, isActive: true, lastSyncAt: true, historyId: true } })} connected={sp.connected === "true"} error={sp.error} />;
}
