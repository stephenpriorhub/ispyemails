"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Mail, Users, Tag, Hash, Search, Settings, Eye, RefreshCw, LogOut, BookOpen, UserCircle } from "lucide-react";
import { useState } from "react";

const adminNav = [
  { href: "/topics", icon: Hash, label: "Topics" },
  { href: "/tags", icon: Tag, label: "Tags" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface Props {
  user?: { id: string; name: string | null; email: string; role: string } | null;
  isAdmin?: boolean;
}

export default function Sidebar({ user, isAdmin = false }: Props) {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try { await fetch("/api/sync"); } finally { setSyncing(false); window.location.reload(); }
  }

  const oxfordhubUrl = process.env.NEXT_PUBLIC_OXFORDHUB_URL ?? "https://oxfordhub.app";

  const coreNav = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/emails", icon: Mail, label: "Emails" },
    { href: "/publishers", icon: Users, label: "Publishers" },
    { href: "/lists", icon: BookOpen, label: "Lists" },
    { href: "/gurus", icon: UserCircle, label: "Gurus" },
    { href: "/search", icon: Search, label: "Search" },
  ];

  const allNav = isAdmin ? [...coreNav, ...adminNav] : coreNav;

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-white text-sm">iSpyEmails</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {allNav.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-amber-500/10 text-amber-400 font-medium"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sync — admin only */}
      {isAdmin && (
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded-md transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      )}

      {/* User + logout */}
      {user && (
        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">{user.name || user.email}</p>
              <p className="text-xs text-gray-600 truncate">{user.email}</p>
              {!isAdmin && <p className="text-xs text-gray-700 truncate">View only</p>}
            </div>
            <a
              href={`${oxfordhubUrl}/signout`}
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </aside>
  );
}
