import { NextRequest, NextResponse } from "next/server";
import { verifyHubSession, loginUrl } from "@/lib/auth";

// Public paths that don't need auth
const PUBLIC = ["/api/auth", "/api/sync", "/_next", "/favicon"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const user = await verifyHubSession(req);
  if (!user) {
    return NextResponse.redirect(loginUrl(req.url));
  }

  // Pass user info to pages via headers (readable in Server Components)
  const res = NextResponse.next();
  res.headers.set("x-user-id", user.id);
  res.headers.set("x-user-email", user.email);
  res.headers.set("x-user-name", user.name ?? "");
  res.headers.set("x-user-role", user.role);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
