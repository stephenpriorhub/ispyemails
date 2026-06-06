"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const OXFORDHUB_URL = process.env.NEXT_PUBLIC_OXFORDHUB_URL ?? "https://oxfordhub.app";
const PROJECT_ID = "cmq1by18o0002ncdujwyk8b60";

export interface HubUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

// Client-side auth check: browser fetches oxfordhub.app/api/me with credentials.
// The browser automatically sends oxfordhub.app's session cookie even from ispy.oxfordhub.app.
export default function ClientAuthProvider({
  children,
  onUser,
}: {
  children: React.ReactNode;
  onUser: (user: HubUser | null) => void;
}) {
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch(`${OXFORDHUB_URL}/api/me?projectId=${PROJECT_ID}`, {
      credentials: "include", // sends oxfordhub.app cookie from browser
      cache: "no-store",
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.authenticated && data?.authorized && data?.user) {
          // Write role cookie so server components can determine isAdmin
          document.cookie = `ispy-role=${data.user.role ?? "user"}; path=/; max-age=86400; SameSite=Lax`;
          onUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? null,
            role: data.user.role ?? "user",
          });
          setChecked(true);
        } else {
          // Not authenticated or not authorized for this project
          const callbackUrl = encodeURIComponent(`https://ispy.oxfordhub.app${pathname}`);
          window.location.href = `${OXFORDHUB_URL}/login?callbackUrl=${callbackUrl}`;
        }
      })
      .catch(() => {
        const callbackUrl = encodeURIComponent(`https://ispy.oxfordhub.app${pathname}`);
        window.location.href = `${OXFORDHUB_URL}/login?callbackUrl=${callbackUrl}`;
      });
  }, []);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500">Checking access…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
