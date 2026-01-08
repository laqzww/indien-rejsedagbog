import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

function getBaseUrl(request: NextRequest): string {
  // 1. Try NEXT_PUBLIC_SITE_URL environment variable first
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  // 2. Try to construct from headers (for reverse proxy setups like Render)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // 3. Try regular host header
  const host = request.headers.get("host");
  if (host && !host.includes("localhost")) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }

  // 4. Fallback to nextUrl origin (may be localhost in dev)
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const baseUrl = getBaseUrl(request);

  // Check if the request came from admin context (referer or explicit param)
  const referer = request.headers.get("referer");
  const isAdminContext = referer?.includes("/admin");

  // Redirect to login with admin redirect if coming from admin, otherwise to root
  if (isAdminContext) {
    return NextResponse.redirect(`${baseUrl}/login?redirect=/admin`);
  }

  return NextResponse.redirect(`${baseUrl}/`);
}
