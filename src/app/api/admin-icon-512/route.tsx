import { ImageResponse } from "next/og";

export const runtime = "edge";

// Generate gear path with perfect symmetry
function generateGearPath(cx: number, cy: number, outerRadius: number, innerRadius: number, teethCount: number) {
  const toothWidth = 0.4;
  let path = "";
  
  for (let i = 0; i < teethCount; i++) {
    const angle = (i * 2 * Math.PI) / teethCount;
    const nextAngle = ((i + 1) * 2 * Math.PI) / teethCount;
    
    // Tooth outer edge
    const toothStart = angle - (toothWidth * Math.PI) / teethCount;
    const toothEnd = angle + (toothWidth * Math.PI) / teethCount;
    
    // Valley (between teeth)
    const valleyStart = toothEnd;
    const valleyEnd = nextAngle - (toothWidth * Math.PI) / teethCount;
    
    const ox1 = cx + outerRadius * Math.cos(toothStart);
    const oy1 = cy + outerRadius * Math.sin(toothStart);
    const ox2 = cx + outerRadius * Math.cos(toothEnd);
    const oy2 = cy + outerRadius * Math.sin(toothEnd);
    const ix1 = cx + innerRadius * Math.cos(valleyStart);
    const iy1 = cy + innerRadius * Math.sin(valleyStart);
    const ix2 = cx + innerRadius * Math.cos(valleyEnd);
    const iy2 = cy + innerRadius * Math.sin(valleyEnd);
    
    if (i === 0) {
      path += `M ${ox1.toFixed(1)} ${oy1.toFixed(1)} `;
    }
    path += `L ${ox2.toFixed(1)} ${oy2.toFixed(1)} L ${ix1.toFixed(1)} ${iy1.toFixed(1)} L ${ix2.toFixed(1)} ${iy2.toFixed(1)} `;
    
    // Connect to next tooth
    const nextToothStart = nextAngle - (toothWidth * Math.PI) / teethCount;
    const nox = cx + outerRadius * Math.cos(nextToothStart);
    const noy = cy + outerRadius * Math.sin(nextToothStart);
    path += `L ${nox.toFixed(1)} ${noy.toFixed(1)} `;
  }
  return path + "Z";
}

export async function GET() {
  // Gear badge parameters - positioned in top-right corner, slightly larger
  const gearCx = 51;
  const gearCy = 13;
  const gearPath = generateGearPath(gearCx, gearCy, 11, 7, 8);

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
          
          {/* Gear badge background */}
          <circle cx={gearCx} cy={gearCy} r="13" fill="#000080" />
          {/* Gear teeth */}
          <path d={gearPath} fill="#FFFDD0" />
          {/* Gear center hole */}
          <circle cx={gearCx} cy={gearCy} r="3" fill="#000080" />
        </svg>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
