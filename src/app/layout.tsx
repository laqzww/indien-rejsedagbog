import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono, Tillana } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const tillana = Tillana({
  variable: "--font-tillana",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
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
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.17.0/mapbox-gl.css"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} ${tillana.variable} antialiased overflow-x-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
