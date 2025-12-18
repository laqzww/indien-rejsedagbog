import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const sizes = {
    sm: { icon: 32, text: "text-lg" },
    md: { icon: 48, text: "text-xl" },
    lg: { icon: 64, text: "text-2xl" },
  };

  const { icon, text } = sizes[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Tuktuk SVG Placeholder Logo */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Background circle */}
        <circle cx="32" cy="32" r="30" fill="#FF9933" />
        
        {/* Tuktuk body */}
        <path
          d="M16 36C16 32 18 28 22 28H38C42 28 46 30 48 34V42C48 44 46 46 44 46H20C18 46 16 44 16 42V36Z"
          fill="white"
        />
        
        {/* Tuktuk roof */}
        <path
          d="M20 28C20 24 24 20 30 20H34C38 20 42 22 44 26L46 28H18L20 28Z"
          fill="#138808"
        />
        
        {/* Front wheel */}
        <circle cx="24" cy="46" r="6" fill="#000080" />
        <circle cx="24" cy="46" r="3" fill="white" />
        
        {/* Back wheel */}
        <circle cx="44" cy="46" r="6" fill="#000080" />
        <circle cx="44" cy="46" r="3" fill="white" />
        
        {/* Window */}
        <rect x="26" y="30" width="12" height="8" rx="1" fill="#87CEEB" />
        
        {/* Headlight */}
        <circle cx="18" cy="36" r="2" fill="#FFD700" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={cn("font-bold text-saffron", text)}>
            Indien
          </span>
          <span className={cn("font-light text-navy -mt-1", text)}>
            Rejsedagbog
          </span>
        </div>
      )}
    </div>
  );
}

