import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "email" | "magiclink" | null;
  const redirect = searchParams.get("redirect") || "/admin";

  // Use production URL, not origin (which might be localhost in some contexts)
  const baseUrl = "https://indien-rejsedagbog.onrender.com";

  if (token_hash && type) {
    const supabase = await createClient();
    
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error) {
      // Successfully verified - redirect to admin
      return NextResponse.redirect(`${baseUrl}${redirect}`);
    }
    
    console.error("Token verification error:", error);
    // Error verifying - redirect to login with error
    return NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Missing parameters - redirect to login
  return NextResponse.redirect(`${baseUrl}/login?error=missing_token`);
}

