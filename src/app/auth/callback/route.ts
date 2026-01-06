import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowlisted } from "@/lib/author";

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
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const redirect = searchParams.get("redirect") || "/admin";

  const supabase = await createClient();

  const maybeProvisionAuthor = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (!isEmailAllowlisted(user.email)) return;

    // Best-effort: if RLS blocks this, we still allow via allowlist.
    await supabase
      .from("profiles")
      .upsert({ id: user.id, is_author: true }, { onConflict: "id" });
  };

  // Handle PKCE flow (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      await maybeProvisionAuthor();
      return NextResponse.redirect(createRedirectUrl(request, redirect));
    }
    console.error("Code exchange error:", error);
  }

  // Handle token hash flow (magic link with token_hash)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "magiclink" | "recovery",
    });
    
    if (!error) {
      await maybeProvisionAuthor();

      // Password recovery: after verification, direct user to set new password.
      if (type === "recovery") {
        return NextResponse.redirect(
          createRedirectUrl(request, "/auth/update-password", { redirect })
        );
      }

      return NextResponse.redirect(createRedirectUrl(request, redirect));
    }
    console.error("Token verification error:", error);
  }

  // If we have neither code nor token_hash, show helpful error page
  const errorParams: Record<string, string> = { redirect };
  if (code) errorParams.reason = "code_exchange_failed";
  else if (token_hash) errorParams.reason = "token_verification_failed";
  else errorParams.reason = "missing_params";
  
  return NextResponse.redirect(createRedirectUrl(request, "/auth/error", errorParams));
}

