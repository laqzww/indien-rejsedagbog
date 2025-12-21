import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { getIsAuthor } from "@/lib/author";

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

  const isAuthor = await getIsAuthor(supabase, user);
  if (!isAuthor) {
    redirect("/login?error=not_authorized");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header isAuthor={true} showNavigation={false} />
      <main>{children}</main>
    </div>
  );
}

