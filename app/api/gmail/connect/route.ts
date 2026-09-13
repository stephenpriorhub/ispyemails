import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";
import { requireApiUser } from "@/lib/api-auth";
export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;
 return NextResponse.redirect(getAuthUrl()); }
