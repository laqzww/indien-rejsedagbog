import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Helper to create redirect URL using nextUrl (correctly handles proxy headers)
function createRedirectUrl(request: NextRequest, pathname: string, searchParams?: Record<string, string>) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "email" | "magiclink" | null;
  const redirect = searchParams.get("redirect") || "/admin";

  if (token_hash && type) {
    const supabase = await createClient();
    
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error) {
      // Successfully verified - redirect to destination
      return NextResponse.redirect(createRedirectUrl(request, redirect));
    }
    
    console.error("Token verification error:", error);
    // Error verifying - redirect to login with error
    return NextResponse.redirect(
      createRedirectUrl(request, "/login", { error: error.message })
    );
  }

  // Missing parameters - redirect to login
  return NextResponse.redirect(
    createRedirectUrl(request, "/login", { error: "missing_token" })
  );
}

