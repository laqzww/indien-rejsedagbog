import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Use NEXT_PUBLIC_SITE_URL for production redirect, fall back to request origin
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  // Check if the request came from admin context (referer or explicit param)
  const referer = request.headers.get("referer");
  const isAdminContext = referer?.includes("/admin");

  // Redirect to login with admin redirect if coming from admin, otherwise to root
  if (isAdminContext) {
    return NextResponse.redirect(`${siteUrl}/login?redirect=/admin`);
  }

  return NextResponse.redirect(`${siteUrl}/`);
}

