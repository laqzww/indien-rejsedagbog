"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Share, Plus, Download, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

// LocalStorage key for dismiss state
const DISMISS_KEY = "install-banner-dismissed";

// Types for platform detection
type Platform = "ios" | "android" | "desktop" | "installed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Detect platform and install state
function detectPlatform(): Platform {
  if (typeof window === "undefined") return "desktop";

  // Check if already running as installed PWA
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isStandalone) return "installed";

  const userAgent = window.navigator.userAgent.toLowerCase();

  // iOS detection (iPhone, iPad, iPod)
  const isIOS = /iphone|ipad|ipod/.test(userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  if (isIOS) return "ios";

  // Android detection
  const isAndroid = /android/.test(userAgent);
  if (isAndroid) return "android";

  return "desktop";
}

// Check if banner was dismissed
function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DISMISS_KEY) === "true";
}

// Save dismiss state
function setDismissed(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISS_KEY, "true");
}

export function InstallBanner() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [isVisible, setIsVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Initialize platform detection and visibility
  useEffect(() => {
    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);

    // Show banner only on mobile and if not dismissed/installed
    const shouldShow =
      (detectedPlatform === "ios" || detectedPlatform === "android") &&
      !isDismissed();

    setIsVisible(shouldShow);
  }, []);

  // Listen for Android beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      setIsVisible(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setDismissed();
    setIsVisible(false);
    setShowIOSGuide(false);
  }, []);

  // Handle Android install
  const handleAndroidInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Handle iOS button click - show guide
  const handleIOSClick = useCallback(() => {
    setShowIOSGuide(true);
  }, []);

  // Don't render anything if not visible
  if (!isVisible) return null;

  return (
    <>
      {/* Main Banner */}
      <div
        className={cn(
          "w-full bg-gradient-to-r from-saffron/10 to-india-green/10",
          "border-b border-saffron/20",
          "animate-fade-in"
        )}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-2.5 gap-3">
            {/* Icon and text */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-saffron/20 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-saffron" />
              </div>
              <p className="text-sm text-foreground/80 truncate">
                <span className="font-medium">Installer app</span>
                <span className="hidden sm:inline"> for nem adgang</span>
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {platform === "android" && deferredPrompt && (
                <button
                  onClick={handleAndroidInstall}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-saffron text-white text-sm font-medium rounded-lg hover:bg-saffron-dark transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Installer</span>
                </button>
              )}

              {platform === "android" && !deferredPrompt && (
                <span className="text-xs text-muted-foreground">
                  Åbn i Chrome
                </span>
              )}

              {platform === "ios" && (
                <button
                  onClick={handleIOSClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-saffron text-white text-sm font-medium rounded-lg hover:bg-saffron-dark transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tilføj</span>
                </button>
              )}

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors"
                aria-label="Luk"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Guide Modal */}
      {showIOSGuide && (
        <IOSGuideModal onClose={() => setShowIOSGuide(false)} onDismiss={handleDismiss} />
      )}
    </>
  );
}

// iOS Guide Modal Component
interface IOSGuideModalProps {
  onClose: () => void;
  onDismiss: () => void;
}

function IOSGuideModal({ onClose, onDismiss }: IOSGuideModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-sm mx-4 mb-4 sm:mb-0 bg-white rounded-2xl shadow-xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-lg">Installer app</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-4 space-y-4">
          {/* Step 1 */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-saffron/10 flex items-center justify-center">
              <span className="text-saffron font-bold">1</span>
            </div>
            <div className="flex-1 pt-1.5">
              <p className="text-sm text-foreground">
                Tryk på{" "}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded font-medium">
                  <Share className="w-4 h-4" />
                  Del
                </span>{" "}
                i bunden
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-saffron/10 flex items-center justify-center">
              <span className="text-saffron font-bold">2</span>
            </div>
            <div className="flex-1 pt-1.5">
              <p className="text-sm text-foreground">
                Scroll ned og tryk{" "}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded font-medium">
                  <Plus className="w-4 h-4" />
                  Føj til hjemmeskærm
                </span>
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-india-green/10 flex items-center justify-center">
              <span className="text-india-green font-bold">✓</span>
            </div>
            <div className="flex-1 pt-1.5">
              <p className="text-sm text-foreground">
                Tryk{" "}
                <span className="inline-flex px-2 py-0.5 bg-saffron/10 text-saffron rounded font-medium">
                  Tilføj
                </span>{" "}
                i øverste højre hjørne
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 pt-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-saffron text-white font-medium rounded-lg hover:bg-saffron-dark transition-colors"
          >
            Forstået
          </button>
          <button
            onClick={onDismiss}
            className="py-2.5 px-4 text-muted-foreground hover:text-foreground hover:bg-muted font-medium rounded-lg transition-colors"
          >
            Vis ikke igen
          </button>
        </div>
      </div>
    </div>
  );
}
