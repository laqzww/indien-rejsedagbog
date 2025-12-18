import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Indien Rejsedagbog",
  description: "Følg med på vores eventyr gennem Indien - fra Delhi til Kerala",
  keywords: ["rejsedagbog", "indien", "rejse", "travel", "india"],
  authors: [{ name: "Rejsedagbog" }],
  openGraph: {
    title: "Indien Rejsedagbog",
    description: "Følg med på vores eventyr gennem Indien",
    type: "website",
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
          href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${outfit.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
