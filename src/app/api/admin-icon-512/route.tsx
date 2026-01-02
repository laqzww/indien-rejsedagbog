import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FF9933",
          borderRadius: "20%",
        }}
      >
        <svg width="400" height="400" viewBox="0 0 64 64" fill="none">
          {/* Tuktuk body */}
          <path
            d="M16 36C16 32 18 28 22 28H38C42 28 46 30 48 34V42C48 44 46 46 44 46H20C18 46 16 44 16 42V36Z"
            fill="#FFFDD0"
          />

          {/* Tuktuk roof */}
          <path
            d="M20 28C20 24 24 20 30 20H34C38 20 42 22 44 26L46 28H18L20 28Z"
            fill="#138808"
          />

          {/* Front wheel */}
          <circle cx="24" cy="46" r="6" fill="#000080" />
          <circle cx="24" cy="46" r="3" fill="#FFFDD0" />

          {/* Back wheel */}
          <circle cx="44" cy="46" r="6" fill="#000080" />
          <circle cx="44" cy="46" r="3" fill="#FFFDD0" />

          {/* Window */}
          <rect x="26" y="30" width="12" height="8" rx="1" fill="#87CEEB" />

          {/* Headlight */}
          <circle cx="18" cy="36" r="2" fill="#FFD700" />
        </svg>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
