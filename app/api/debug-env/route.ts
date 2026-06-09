import { NextResponse } from "next/server";
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  return NextResponse.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    cwd: process.cwd(),
    nodeVersion: process.version,
  });
}
