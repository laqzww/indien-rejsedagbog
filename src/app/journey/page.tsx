"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function JourneyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let redirectUrl = "/?view=map";
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const zoom = searchParams.get("zoom");
    if (lat && lng) {
      redirectUrl += `&lat=${lat}&lng=${lng}`;
      if (zoom) {
        redirectUrl += `&zoom=${zoom}`;
      }
    }
    router.replace(redirectUrl);
  }, [router, searchParams]);

  return null;
}

export default function JourneyPage() {
  return (
    <Suspense>
      <JourneyRedirect />
    </Suspense>
  );
}
