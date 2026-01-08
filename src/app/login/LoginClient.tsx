"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { ADMIN_CONTEXT_COOKIE } from "@/components/AdminPwaRedirect";

/**
 * Sets the admin-context cookie to mark that the user is in admin context.
 * This cookie is used by AdminPwaRedirect to redirect standalone PWA users
 * back to /admin when the PWA incorrectly opens at / due to cached manifest issues.
 */
function setAdminContextCookie() {
  if (typeof document === "undefined") return;
  
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  
  document.cookie = `${ADMIN_CONTEXT_COOKIE}=1; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

interface LoginClientProps {
  redirect: string;
  errorParam: string | null;
}

export function LoginClient({ redirect, errorParam }: LoginClientProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"magiclink" | "password">("password");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Set admin-context cookie if we're redirecting to admin
  // This ensures the cookie is set BEFORE the user logs in, so if they install the PWA
  // from the login page, future opens will have the admin context
  useEffect(() => {
    if (redirect.startsWith("/admin")) {
      setAdminContextCookie();
      // Also set localStorage for redundancy
      localStorage.setItem("admin-pwa-user", "true");
    }
  }, [redirect]);

  const initialError = useMemo(() => {
    if (!errorParam) return null;
    if (errorParam === "not_authorized") {
      return "Du er logget ind, men har ikke adgang til admin.";
    }
    return decodeURIComponent(errorParam);
  }, [errorParam]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        // Server-side pages rely on auth cookies; hard navigation ensures fresh session.
        window.location.assign(redirect);
      }
      setLoading(false);
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ 
        type: "success", 
        text: "Tjek din email! Vi har sendt dig et magic link til at logge ind." 
      });
      setEmail("");
      setPassword("");
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?type=recovery&redirect=${encodeURIComponent(redirect)}`,
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({
          type: "success",
          text: "Tjek din email for et link til at sætte et nyt password.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-white via-orange-50 to-green-50">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-saffron/10 to-transparent rounded-full" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-india-green/10 to-transparent rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <Card className="border-saffron/20 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-navy">Log ind</CardTitle>
            <CardDescription>
              Brug din email til at få adgang til dagbogen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {initialError && !message && (
              <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-destructive/10 text-destructive mb-4">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {initialError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <Button
                type="button"
                variant={mode === "password" ? "default" : "outline"}
                onClick={() => setMode("password")}
                disabled={loading}
              >
                Password
              </Button>
              <Button
                type="button"
                variant={mode === "magiclink" ? "default" : "outline"}
                onClick={() => setMode("magiclink")}
                disabled={loading}
              >
                Magic link
              </Button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="din@email.dk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {mode === "password" && (
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Har du ikke et password endnu? Brug &quot;Magic link&quot; eller sæt et nyt.
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="px-0 h-auto text-xs"
                      onClick={handleForgotPassword}
                      disabled={loading || !email}
                    >
                      Glemt password?
                    </Button>
                  </div>
                </div>
              )}

              {message && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-md text-sm ${
                    message.type === "success"
                      ? "bg-india-green/10 text-india-green"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {message.type === "success" ? (
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  {message.text}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "magiclink" ? "Sender..." : "Logger ind..."}
                  </>
                ) : (
                  mode === "magiclink" ? "Send magic link" : "Log ind"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Kun autoriserede forfattere kan logge ind.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
