import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BadgeManager } from "@/components/BadgeManager";

export const viewport: Viewport = {
  themeColor: "#FF9933",
};

export const metadata: Metadata = {
  title: {
    default: "T&A Indien Rejsedagbog",
    template: "%s | T&A Indien",
  },
  description: "Følg med på Tommy og Amalies eventyr gennem Indien - fra Kerala til Delhi",
  keywords: ["rejsedagbog", "indien", "rejse", "travel", "india", "tommy", "amalie"],
  authors: [{ name: "Tommy og Amalie" }],
  openGraph: {
    title: "Tommy og Amalies Indien Rejsedagbog",
    description: "Følg med på vores eventyr gennem Indien - fra Kerala til Delhi",
    type: "website",
  },
  // Explicit manifest to allow proper override in admin layout
  manifest: "/manifest.webmanifest",
  // Apple specific settings
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "T&A Indien",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Tillana:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.17.0/mapbox-gl.css"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased min-h-dvh min-h-[100svh]"
      >
        <BadgeManager />
        {children}
      </body>
    </html>
  );
}
