import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  // Generate gear teeth path using trigonometry for perfect symmetry
  const cx = 32; // center x
  const cy = 32; // center y
  const outerRadius = 26; // outer radius of gear
  const innerRadius = 18; // inner radius (valley between teeth)
  const teethCount = 8; // number of teeth
  const toothWidth = 0.35; // tooth width as fraction of segment (0-1)

  // Build the gear path
  let gearPath = "";
  for (let i = 0; i < teethCount; i++) {
    const startAngle = (i * 2 * Math.PI) / teethCount;
    const toothStartAngle = startAngle - (toothWidth * Math.PI) / teethCount;
    const toothEndAngle = startAngle + (toothWidth * Math.PI) / teethCount;
    const valleyStartAngle = toothEndAngle;
    const valleyEndAngle =
      ((i + 1) * 2 * Math.PI) / teethCount - (toothWidth * Math.PI) / teethCount;

    // Outer tooth corners
    const outerX1 = cx + outerRadius * Math.cos(toothStartAngle);
    const outerY1 = cy + outerRadius * Math.sin(toothStartAngle);
    const outerX2 = cx + outerRadius * Math.cos(toothEndAngle);
    const outerY2 = cy + outerRadius * Math.sin(toothEndAngle);

    // Inner valley corners
    const innerX1 = cx + innerRadius * Math.cos(valleyStartAngle);
    const innerY1 = cy + innerRadius * Math.sin(valleyStartAngle);
    const innerX2 = cx + innerRadius * Math.cos(valleyEndAngle);
    const innerY2 = cy + innerRadius * Math.sin(valleyEndAngle);

    if (i === 0) {
      gearPath += `M ${outerX1.toFixed(2)} ${outerY1.toFixed(2)} `;
    }

    gearPath += `L ${outerX2.toFixed(2)} ${outerY2.toFixed(2)} `;
    gearPath += `L ${innerX1.toFixed(2)} ${innerY1.toFixed(2)} `;
    gearPath += `L ${innerX2.toFixed(2)} ${innerY2.toFixed(2)} `;

    // Connect to next tooth
    const nextOuterX =
      cx +
      outerRadius *
        Math.cos(
          ((i + 1) * 2 * Math.PI) / teethCount -
            (toothWidth * Math.PI) / teethCount
        );
    const nextOuterY =
      cy +
      outerRadius *
        Math.sin(
          ((i + 1) * 2 * Math.PI) / teethCount -
            (toothWidth * Math.PI) / teethCount
        );
    gearPath += `L ${nextOuterX.toFixed(2)} ${nextOuterY.toFixed(2)} `;
  }
  gearPath += "Z";

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
        <svg width="140" height="140" viewBox="0 0 64 64" fill="none">
          {/* Gear body with teeth */}
          <path d={gearPath} fill="#000080" />
          {/* Center hole */}
          <circle cx="32" cy="32" r="8" fill="#FF9933" />
          {/* Center dot */}
          <circle cx="32" cy="32" r="3" fill="#000080" />
        </svg>
      </div>
    ),
    {
      width: 180,
      height: 180,
    }
  );
}
