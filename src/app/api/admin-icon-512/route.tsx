import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  // 8-tooth gear centered at (51, 13), outer radius 8, inner radius 5.5
  // Mathematically generated for perfect symmetry - smaller for better fit in badge
  const gearPath = "M48.9,5.3 L53.1,5.3 L52.4,7.7 L53.8,8.2 L55.0,6.1 L57.9,9.0 L55.8,10.3 L56.3,11.6 L58.7,10.9 L58.7,15.1 L56.3,14.4 L55.8,15.8 L57.9,17.0 L55.0,19.9 L53.8,17.8 L52.4,18.3 L53.1,20.7 L48.9,20.7 L49.6,18.3 L48.3,17.8 L47.0,19.9 L44.1,17.0 L46.2,15.8 L45.7,14.4 L43.3,15.1 L43.3,10.9 L45.7,11.6 L46.2,10.3 L44.1,9.0 L47.0,6.1 L48.3,8.2 L49.6,7.7 L48.9,5.3 Z";

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
          
          {/* Gear badge - Navy background circle */}
          <circle cx="51" cy="13" r="12" fill="#000080" />
          {/* Simple gear shape */}
          <path d={gearPath} fill="#FFFDD0" />
          {/* Center hole */}
          <circle cx="51" cy="13" r="2.5" fill="#000080" />
        </svg>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
