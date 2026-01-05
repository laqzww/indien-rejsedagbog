import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  // 8-tooth gear centered at (51, 13), outer radius 10, inner radius 7
  // Mathematically generated for perfect symmetry
  const gearPath = "M48.4,3.3 L53.6,3.3 L52.8,6.2 L54.5,6.9 L56.0,4.3 L59.7,8.0 L57.1,9.5 L57.8,11.2 L60.7,10.4 L60.7,15.6 L57.8,14.8 L57.1,16.5 L59.7,18.0 L56.0,21.7 L54.5,19.1 L52.8,19.8 L53.6,22.7 L48.4,22.7 L49.2,19.8 L47.5,19.1 L46.0,21.7 L42.3,18.0 L44.9,16.5 L44.2,14.8 L41.3,15.6 L41.3,10.4 L44.2,11.2 L44.9,9.5 L42.3,8.0 L46.0,4.3 L47.5,6.9 L49.2,6.2 L48.4,3.3 Z";

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
        <svg width="150" height="150" viewBox="0 0 64 64" fill="none">
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
          <circle cx="51" cy="13" r="3" fill="#000080" />
        </svg>
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}
