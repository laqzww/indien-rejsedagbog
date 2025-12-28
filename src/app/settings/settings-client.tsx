"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, CheckCircle, Loader2, Upload, Trash2, User } from "lucide-react";
import { uploadAvatar, deleteAvatar, getAvatarUrl, isStoragePath } from "@/lib/upload";
import { compressImage } from "@/lib/image-compression";

type InitialProfile = {
  displayName: string;
  avatarUrl: string;
};

export function SettingsClient({ initialProfile }: { initialProfile: InitialProfile }) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl);
  
  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle file selection for avatar
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setProfileMessage({ type: "error", text: "Vælg venligst en billedfil." });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage({ type: "error", text: "Billedet er for stort. Maks 5MB." });
      return;
    }

    setAvatarFile(file);
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setProfileMessage(null);
  };

  // Remove selected avatar
  const handleRemoveAvatar = async () => {
    // If there's a pending file, just clear it
    if (avatarFile) {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    // If there's an existing avatar, mark for deletion
    if (avatarUrl) {
      setAvatarUrl("");
      setProfileMessage({ type: "success", text: "Profilbillede vil blive fjernet når du gemmer." });
    }
  };

  // Get the current display URL for avatar
  const currentAvatarDisplayUrl = useMemo(() => {
    if (avatarPreview) return avatarPreview;
    if (avatarUrl) return getAvatarUrl(avatarUrl);
    return null;
  }, [avatarPreview, avatarUrl]);

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

      let newAvatarPath = avatarUrl;

      // If there's a new file to upload
      if (avatarFile) {
        setUploadingAvatar(true);
        try {
          // Compress the image first (max 400x400 for avatars)
          const compressed = await compressImage(avatarFile, {
            maxWidth: 400,
            maxHeight: 400,
            quality: 0.85,
          });

          // Upload the compressed image
          const result = await uploadAvatar(compressed.blob, user.id, avatarFile.name);
          newAvatarPath = result.path;

          // Clean up preview
          if (avatarPreview) {
            URL.revokeObjectURL(avatarPreview);
          }
          setAvatarFile(null);
          setAvatarPreview(null);
        } finally {
          setUploadingAvatar(false);
        }
      } else if (!avatarUrl && initialProfile.avatarUrl && isStoragePath(initialProfile.avatarUrl)) {
        // Avatar was removed and was a storage path - delete from storage
        try {
          await deleteAvatar(initialProfile.avatarUrl);
        } catch (err) {
          console.warn("Could not delete old avatar:", err);
        }
        newAvatarPath = "";
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          avatar_url: newAvatarPath.trim() || null,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Update local state with the new path
      setAvatarUrl(newAvatarPath);
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
            <label className="text-sm font-medium">
              Profilbillede (valgfri)
            </label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                {currentAvatarDisplayUrl ? (
                  <AvatarImage src={currentAvatarDisplayUrl} alt="Profilbillede" />
                ) : null}
                <AvatarFallback className="text-2xl bg-muted">
                  <User className="h-10 w-10 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                  disabled={savingProfile}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={savingProfile}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {currentAvatarDisplayUrl ? "Skift billede" : "Upload billede"}
                </Button>
                
                {(currentAvatarDisplayUrl || avatarFile) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={savingProfile}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Fjern billede
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Maks 5MB. Billedet skaleres automatisk til 400x400px.
            </p>
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
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {uploadingAvatar ? "Uploader billede..." : "Gemmer..."}
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
