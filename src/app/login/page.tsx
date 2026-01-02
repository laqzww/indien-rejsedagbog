import type { Metadata } from "next";
import { LoginClient } from "./LoginClient";

interface PageProps {
  searchParams: Promise<{
    redirect?: string;
    error?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const redirect = params.redirect || "/admin";
  
  // If redirecting to admin, use admin manifest for Safari iOS bookmarks
  if (redirect.startsWith("/admin")) {
    return {
      title: "Log ind",
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
  }
  
  return {
    title: "Log ind",
  };
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const redirect = params.redirect || "/admin";
  const errorParam = params.error || null;

  return <LoginClient redirect={redirect} errorParam={errorParam} />;
}
