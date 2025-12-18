"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

type InitialProfile = {
  displayName: string;
  avatarUrl: string;
};

export function SettingsClient({ initialProfile }: { initialProfile: InitialProfile }) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const passwordValidationError = useMemo(() => {
    if (!newPassword && !confirmPassword) return null;
    if (newPassword.length < 8) return "Password skal være mindst 8 tegn.";
    if (newPassword !== confirmPassword) return "Passwords matcher ikke.";
    return null;
  }, [newPassword, confirmPassword]);

  const saveProfile = async () => {
    setProfileMessage(null);
    setSavingProfile(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Du er ikke logget ind");

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("id", user.id);

      if (error) throw error;

      setProfileMessage({ type: "success", text: "Profil gemt." });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Noget gik galt";
      setProfileMessage({ type: "error", text });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setPasswordMessage(null);

    if (passwordValidationError) {
      setPasswordMessage({ type: "error", text: passwordValidationError });
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordMessage({ type: "success", text: "Password opdateret." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Noget gik galt";
      setPasswordMessage({ type: "error", text });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Indstillinger</h1>
        <p className="text-sm text-muted-foreground mt-1">Redigér profil og sikkerhed.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Navn og avatar som vises i dagbogen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium">
              Visningsnavn
            </label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Fx Tommy & Amalie"
              disabled={savingProfile}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="avatarUrl" className="text-sm font-medium">
              Avatar URL (valgfri)
            </label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              disabled={savingProfile}
            />
          </div>

          {profileMessage && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md text-sm ${
                profileMessage.type === "success"
                  ? "bg-india-green/10 text-india-green"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {profileMessage.type === "success" ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {profileMessage.text}
            </div>
          )}

          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gemmer...
              </>
            ) : (
              "Gem profil"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Sæt/ændr dit password. Minimum 8 tegn.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">
              Nyt password
            </label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={savingPassword}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Gentag password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={savingPassword}
              autoComplete="new-password"
            />
          </div>

          {passwordMessage && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md text-sm ${
                passwordMessage.type === "success"
                  ? "bg-india-green/10 text-india-green"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {passwordMessage.type === "success" ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {passwordMessage.text}
            </div>
          )}

          <Button onClick={savePassword} disabled={savingPassword || !newPassword || !confirmPassword}>
            {savingPassword ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opdaterer...
              </>
            ) : (
              "Opdater password"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
