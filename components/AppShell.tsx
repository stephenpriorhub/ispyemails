"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ClientAuthProvider, { HubUser } from "@/components/ClientAuthProvider";
import { isAdminRole } from "@/lib/auth-client";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<HubUser | null>(null);
  const isAdmin = isAdminRole(user?.role);

  return (
    <ClientAuthProvider onUser={setUser}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} isAdmin={isAdmin} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ClientAuthProvider>
  );
}
