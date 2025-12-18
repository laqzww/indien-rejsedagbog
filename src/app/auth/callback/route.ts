import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const redirect = searchParams.get("redirect") || "/admin";

  const supabase = await createClient();

  // Handle PKCE flow (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${origin}${redirect}`);
    }
    console.error("Code exchange error:", error);
  }

  // Handle token hash flow (magic link with token_hash)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "magiclink",
    });
    
    if (!error) {
      return NextResponse.redirect(`${origin}${redirect}`);
    }
    console.error("Token verification error:", error);
  }

  // If we have neither code nor token_hash, show helpful error page
  const errorUrl = new URL(`${origin}/auth/error`);
  errorUrl.searchParams.set("redirect", redirect);
  if (code) errorUrl.searchParams.set("reason", "code_exchange_failed");
  if (token_hash) errorUrl.searchParams.set("reason", "token_verification_failed");
  if (!code && !token_hash) errorUrl.searchParams.set("reason", "missing_params");
  
  return NextResponse.redirect(errorUrl.toString());
}

