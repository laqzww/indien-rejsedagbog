/** @type {import('next').NextConfig} */

// Extract Supabase hostname from environment variable for image optimization
function getSupabaseHostname() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    // Fallback for build time when env might not be available
    return "*.supabase.co";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "*.supabase.co";
  }
}

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: getSupabaseHostname(),
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Enable SharedArrayBuffer for ffmpeg.wasm multi-threaded mode
  // Scoped to /admin/compress to avoid breaking Supabase Auth and Mapbox on other pages
  async headers() {
    return [
      {
        source: "/admin/compress",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
