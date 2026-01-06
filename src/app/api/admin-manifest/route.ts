import { NextResponse } from "next/server";

export async function GET() {
  const manifest = {
    id: "/admin",
    name: "Indientur Admin",
    short_name: "T&A Admin",
    description: "Admin panel til Tommy og Amalies rejsedagbog",
    start_url: "/admin",
    // Scope must be "/" to allow navigation to /login for authentication
    // The start_url ensures the app opens at /admin
    scope: "/",
    display: "standalone",
    background_color: "#FFFDD0",
    theme_color: "#FF9933",
    icons: [
      {
        src: "/api/admin-icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/api/admin-icon-512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}
