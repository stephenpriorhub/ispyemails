"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ClientAuthProvider, { HubUser } from "@/components/ClientAuthProvider";
import { isAdminRole } from "@/lib/auth-client";
import { Eye, Menu } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<HubUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = isAdminRole(user?.role);

  return (
    <ClientAuthProvider onUser={setUser}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} isAdmin={isAdmin} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar with hamburger */}
          <header className="md:hidden flex items-center gap-2 px-4 h-12 border-b border-gray-800 bg-gray-900 flex-shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 -ml-1.5 text-gray-300 hover:text-white"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-400" />
              <span className="font-bold text-white text-sm">iSpyFinpub</span>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ClientAuthProvider>
  );
}
