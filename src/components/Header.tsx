"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { Map, BookOpen, Settings } from "lucide-react";

interface HeaderProps {
  isAuthor?: boolean;
  activeView?: "feed" | "map";
  onViewChange?: (view: "feed" | "map") => void;
  showNavigation?: boolean;
}

export function Header({ 
  isAuthor = false, 
  activeView = "feed",
  onViewChange,
  showNavigation = true,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo - always links to home */}
          <Link href="/" className="flex-shrink-0">
            <Logo size="sm" />
          </Link>

          {/* Icon Navigation */}
          {showNavigation && (
            <nav className="flex items-center gap-1">
              {/* Feed Icon */}
              <button
                onClick={() => onViewChange?.("feed")}
                className={cn(
                  "p-2.5 rounded-lg transition-all",
                  activeView === "feed"
                    ? "bg-saffron text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-navy"
                )}
                aria-label="Opslag"
                title="Opslag"
              >
                <BookOpen className="h-5 w-5" />
              </button>

              {/* Map Icon */}
              <button
                onClick={() => onViewChange?.("map")}
                className={cn(
                  "p-2.5 rounded-lg transition-all",
                  activeView === "map"
                    ? "bg-saffron text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-navy"
                )}
                aria-label="Kort"
                title="Kort"
              >
                <Map className="h-5 w-5" />
              </button>

              {/* Admin Icon - only for authors */}
              {isAuthor && (
                <Link
                  href="/admin"
                  className="p-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-navy transition-all ml-1"
                  aria-label="Admin"
                  title="Admin"
                >
                  <Settings className="h-5 w-5" />
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
