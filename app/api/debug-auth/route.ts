import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const h = await headers();
  const cookieHeader = h.get("x-forwarded-cookies") || h.get("cookie") || "";

  let meResult: unknown = null;
  if (cookieHeader) {
    try {
      const res = await fetch(
        `${process.env.OXFORDHUB_URL ?? "https://oxfordhub.app"}/api/me?projectId=cmq1by18o0002ncdujwyk8b60`,
        { headers: { cookie: cookieHeader }, cache: "no-store" }
      );
      meResult = await res.json();
    } catch (e) {
      meResult = { fetchError: String(e) };
    }
  }

  return NextResponse.json({
    hasCookie: !!cookieHeader,
    cookieSnippet: cookieHeader.substring(0, 80),
    oxfordhubUrl: process.env.OXFORDHUB_URL,
    hubApiToken: process.env.HUB_API_TOKEN ? "set" : "missing",
    meResult,
  });
}
