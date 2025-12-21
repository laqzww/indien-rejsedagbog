import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Rejserute",
  description: "Se hele rejseruten gennem Indien på kortet",
};

interface PageProps {
  searchParams: Promise<{ lat?: string; lng?: string; zoom?: string }>;
}

// Redirect to home page - map is now integrated there
// Forward lat/lng/zoom params to enable POI focus
export default async function JourneyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  
  // Build redirect URL with optional POI focus parameters
  let redirectUrl = "/?view=map";
  if (params.lat && params.lng) {
    redirectUrl += `&lat=${params.lat}&lng=${params.lng}`;
    if (params.zoom) {
      redirectUrl += `&zoom=${params.zoom}`;
    }
  }
  
  redirect(redirectUrl);
}
