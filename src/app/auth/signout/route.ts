import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Use nextUrl which correctly handles proxy headers (x-forwarded-host, etc.)
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.search = "";

  // Check if the request came from admin context (referer or explicit param)
  const referer = request.headers.get("referer");
  const isAdminContext = referer?.includes("/admin");

  // Redirect to login with admin redirect if coming from admin, otherwise to root
  if (isAdminContext) {
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", "/admin");
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.pathname = "/";
  return NextResponse.redirect(redirectUrl);
}
