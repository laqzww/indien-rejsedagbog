import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tommy og Amalies Indien Rejsedagbog",
    short_name: "T&A Indien",
    description: "Følg med på Tommy og Amalies eventyr gennem Indien",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFDD0",
    theme_color: "#FF9933",
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
