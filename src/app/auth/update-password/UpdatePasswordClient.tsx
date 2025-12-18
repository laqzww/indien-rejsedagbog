"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export function UpdatePasswordClient() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/admin";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const validationError = useMemo(() => {
    if (!password || !confirm) return null;
    if (password.length < 8) return "Password skal være mindst 8 tegn.";
    if (password !== confirm) return "Passwords matcher ikke.";
    return null;
  }, [password, confirm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "success", text: "Password er opdateret. Sender dig videre..." });
        window.location.assign(redirect);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-white via-orange-50 to-green-50">
      <Card className="w-full max-w-md border-saffron/20 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-navy">Sæt nyt password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Vælg et nyt password, så du fremover kan logge ind med email + password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Nyt password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm" className="text-sm font-medium text-foreground">
                Gentag password
              </label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
                autoComplete="new-password"
                required
              />
            </div>

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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opdaterer...
                </>
              ) : (
                "Opdater password"
              )}
            </Button>
          </form>

          <div className="text-center">
            <Link
              href={`/login?redirect=${encodeURIComponent(redirect)}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              Tilbage til login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
