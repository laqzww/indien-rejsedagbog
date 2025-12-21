import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { getIsAuthor } from "@/lib/author";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings");
  }

  const isAuthor = await getIsAuthor(supabase, user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-white">
      <Header isAuthor={isAuthor} showNavigation={false} />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <SettingsClient
          initialProfile={{
            displayName: profile?.display_name ?? "",
            avatarUrl: profile?.avatar_url ?? "",
          }}
        />
      </main>
    </div>
  );
}
