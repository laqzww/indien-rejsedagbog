import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect("/login?redirect=/admin");
  }

  // Check if user is an author
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_author")
    .eq("id", user.id)
    .single();

  if (!profile?.is_author) {
    redirect("/?error=not_authorized");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header isAuthor={true} />
      <main>{children}</main>
    </div>
  );
}

