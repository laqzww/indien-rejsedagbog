import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { getIsAuthor } from "@/lib/author";
import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/api/admin-manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Indientur Admin",
  },
  icons: {
    apple: "/api/admin-apple-icon",
  },
};

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
      <Header isAuthor={true} activeView="admin" useLinks={true} />
      <main>{children}</main>
    </div>
  );
}

