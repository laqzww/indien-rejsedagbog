import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "T&A Indien Admin",
    short_name: "T&A Admin",
    description: "Admin panel til Tommy og Amalies rejsedagbog",
    start_url: "/admin",
    display: "standalone",
    background_color: "#FFFDD0",
    theme_color: "#000080", // Navy to distinguish from main app
    icons: [
      {
        src: "/admin/icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/admin/icon-512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
