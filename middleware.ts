// Middleware is kept minimal — just passes cookies through as headers
// so the app layout (Node.js runtime) can do the actual auth check.
// Edge runtime has network restrictions that prevent fetching oxfordhub.app.
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  // Forward the cookie header so Server Components can read it
  const cookies = req.headers.get("cookie") ?? "";
  res.headers.set("x-forwarded-cookies", cookies);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
