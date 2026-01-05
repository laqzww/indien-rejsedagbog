"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Share, Plus, Download, Smartphone, MoreVertical, Menu, EllipsisVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// LocalStorage key for dismiss state
const DISMISS_KEY = "install-banner-dismissed";

// Types for platform and browser detection
type Platform = "ios" | "android" | "desktop" | "installed";
type Browser = "safari" | "chrome" | "firefox" | "edge" | "samsung" | "opera" | "other";

interface DeviceInfo {
  platform: Platform;
  browser: Browser;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Detect platform, browser and install state
function detectDevice(): DeviceInfo {
  if (typeof window === "undefined") {
    return { platform: "desktop", browser: "other" };
  }

  // Check if already running as installed PWA
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isStandalone) {
    return { platform: "installed", browser: "other" };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const vendor = window.navigator.vendor?.toLowerCase() || "";

  // Detect browser first
  let browser: Browser = "other";

  // Order matters - check more specific browsers first
  if (/samsungbrowser/.test(userAgent)) {
    browser = "samsung";
  } else if (/opr|opera/.test(userAgent)) {
    browser = "opera";
  } else if (/edg/.test(userAgent)) {
    browser = "edge";
  } else if (/firefox|fxios/.test(userAgent)) {
    browser = "firefox";
  } else if (/crios/.test(userAgent)) {
    // Chrome on iOS uses CriOS
    browser = "chrome";
  } else if (/chrome/.test(userAgent) && /google inc/.test(vendor)) {
    browser = "chrome";
  } else if (/safari/.test(userAgent) && /apple computer/.test(vendor)) {
    browser = "safari";
  }

  // Detect platform
  const isIOS = /iphone|ipad|ipod/.test(userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  if (isIOS) {
    return { platform: "ios", browser };
  }

  const isAndroid = /android/.test(userAgent);
  if (isAndroid) {
    return { platform: "android", browser };
  }

  return { platform: "desktop", browser };
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
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ platform: "desktop", browser: "other" });
  const [isVisible, setIsVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Initialize platform detection and visibility
  useEffect(() => {
    const detected = detectDevice();
    setDeviceInfo(detected);

    // Show banner only on mobile and if not dismissed/installed
    const shouldShow =
      (detected.platform === "ios" || detected.platform === "android") &&
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
    setShowGuide(false);
  }, []);

  // Handle native install (Android Chrome primarily)
  const handleNativeInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Handle guide button click
  const handleShowGuide = useCallback(() => {
    setShowGuide(true);
  }, []);

  // Don't render anything if not visible
  if (!isVisible) return null;

  const { platform, browser } = deviceInfo;

  // Determine if we have native install support
  const hasNativeInstall = deferredPrompt !== null;

  // Get browser-specific message for banner
  const getBannerMessage = () => {
    if (platform === "ios" && browser !== "safari") {
      return "Åbn i Safari for bedste oplevelse";
    }
    return "Installer app for nem adgang";
  };

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
                <span className="font-medium">{getBannerMessage()}</span>
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Native install available (Android Chrome) */}
              {hasNativeInstall && (
                <button
                  onClick={handleNativeInstall}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-saffron text-white text-sm font-medium rounded-lg hover:bg-saffron-dark transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Installer</span>
                </button>
              )}

              {/* Android without native install - show guide */}
              {platform === "android" && !hasNativeInstall && (
                <button
                  onClick={handleShowGuide}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-saffron text-white text-sm font-medium rounded-lg hover:bg-saffron-dark transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tilføj</span>
                </button>
              )}

              {/* iOS - show guide */}
              {platform === "ios" && (
                <button
                  onClick={handleShowGuide}
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

      {/* Guide Modal */}
      {showGuide && (
        <InstallGuideModal
          platform={platform}
          browser={browser}
          onClose={() => setShowGuide(false)}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}

// =============================================================================
// Install Guide Modal Component
// =============================================================================

interface InstallGuideModalProps {
  platform: Platform;
  browser: Browser;
  onClose: () => void;
  onDismiss: () => void;
}

// Step type for guide
interface GuideStep {
  icon: React.ReactNode;
  label: string;
  description: string;
}

// Get browser-specific instructions
function getInstallSteps(platform: Platform, browser: Browser): GuideStep[] {
  // iOS Safari - standard flow
  if (platform === "ios" && browser === "safari") {
    return [
      {
        icon: <Share className="w-4 h-4" />,
        label: "Del",
        description: "Tryk på del-knappen i bunden af skærmen",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj til hjemmeskærm",
        description: "Scroll ned og tryk på \"Føj til hjemmeskærm\"",
      },
      {
        icon: <span className="text-sm font-semibold">Tilføj</span>,
        label: "Bekræft",
        description: "Tryk \"Tilføj\" i øverste højre hjørne",
      },
    ];
  }

  // iOS Chrome - menu at top
  if (platform === "ios" && browser === "chrome") {
    return [
      {
        icon: <EllipsisVertical className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på de 3 prikker (⋯) i øverste højre hjørne",
      },
      {
        icon: <Share className="w-4 h-4" />,
        label: "Del...",
        description: "Vælg \"Del...\" i menuen",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj til hjemmeskærm",
        description: "Vælg \"Føj til hjemmeskærm\" og tryk \"Tilføj\"",
      },
    ];
  }

  // iOS Firefox
  if (platform === "ios" && browser === "firefox") {
    return [
      {
        icon: <Menu className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på menu-ikonet (☰) i bunden",
      },
      {
        icon: <Share className="w-4 h-4" />,
        label: "Del",
        description: "Vælg \"Del\" i menuen",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj til hjemmeskærm",
        description: "Vælg \"Føj til hjemmeskærm\" og bekræft",
      },
    ];
  }

  // iOS Edge
  if (platform === "ios" && browser === "edge") {
    return [
      {
        icon: <Menu className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på menu-ikonet (☰) i bunden",
      },
      {
        icon: <Share className="w-4 h-4" />,
        label: "Del",
        description: "Vælg \"Del\" i menuen",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj til hjemmeskærm",
        description: "Vælg \"Føj til hjemmeskærm\" og bekræft",
      },
    ];
  }

  // iOS other browsers - recommend Safari
  if (platform === "ios") {
    return [
      {
        icon: <span className="text-sm">🧭</span>,
        label: "Åbn Safari",
        description: "For bedste oplevelse, åbn siden i Safari",
      },
      {
        icon: <Share className="w-4 h-4" />,
        label: "Del",
        description: "Tryk på del-knappen i bunden",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj til hjemmeskærm",
        description: "Vælg \"Føj til hjemmeskærm\"",
      },
    ];
  }

  // Android Firefox
  if (platform === "android" && browser === "firefox") {
    return [
      {
        icon: <MoreVertical className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på de 3 prikker (⋮) i øverste højre hjørne",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Installer",
        description: "Vælg \"Installer\" eller \"Føj til hjemmeskærm\"",
      },
      {
        icon: <span className="text-sm font-semibold">OK</span>,
        label: "Bekræft",
        description: "Bekræft installationen",
      },
    ];
  }

  // Android Samsung Internet
  if (platform === "android" && browser === "samsung") {
    return [
      {
        icon: <Menu className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på menu-ikonet (☰) i bunden",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj side til",
        description: "Vælg \"Føj side til\" → \"Hjemmeskærm\"",
      },
      {
        icon: <span className="text-sm font-semibold">Tilføj</span>,
        label: "Bekræft",
        description: "Tryk \"Tilføj\" for at bekræfte",
      },
    ];
  }

  // Android Edge
  if (platform === "android" && browser === "edge") {
    return [
      {
        icon: <MoreVertical className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på de 3 prikker (⋯) i bunden",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Føj til telefon",
        description: "Vælg \"Føj til telefon\"",
      },
      {
        icon: <span className="text-sm font-semibold">Tilføj</span>,
        label: "Bekræft",
        description: "Bekræft installationen",
      },
    ];
  }

  // Android Opera
  if (platform === "android" && browser === "opera") {
    return [
      {
        icon: <MoreVertical className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på de 3 prikker (⋮) i øverste højre hjørne",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Hjemmeskærm",
        description: "Vælg \"Hjemmeskærm\" eller \"Tilføj til...\"",
      },
      {
        icon: <span className="text-sm font-semibold">OK</span>,
        label: "Bekræft",
        description: "Bekræft installationen",
      },
    ];
  }

  // Android Chrome fallback (if beforeinstallprompt didn't fire)
  if (platform === "android" && browser === "chrome") {
    return [
      {
        icon: <MoreVertical className="w-4 h-4" />,
        label: "Menu",
        description: "Tryk på de 3 prikker (⋮) i øverste højre hjørne",
      },
      {
        icon: <Download className="w-4 h-4" />,
        label: "Installer app",
        description: "Vælg \"Installer app\" eller \"Føj til hjemmeskærm\"",
      },
      {
        icon: <span className="text-sm font-semibold">Installer</span>,
        label: "Bekræft",
        description: "Tryk \"Installer\" for at bekræfte",
      },
    ];
  }

  // Android other browsers - generic
  if (platform === "android") {
    return [
      {
        icon: <MoreVertical className="w-4 h-4" />,
        label: "Menu",
        description: "Åbn browserens menu",
      },
      {
        icon: <Plus className="w-4 h-4" />,
        label: "Tilføj til hjemmeskærm",
        description: "Find \"Tilføj til hjemmeskærm\" eller lignende",
      },
      {
        icon: <span className="text-sm font-semibold">OK</span>,
        label: "Bekræft",
        description: "Bekræft installationen",
      },
    ];
  }

  // Fallback
  return [
    {
      icon: <Menu className="w-4 h-4" />,
      label: "Menu",
      description: "Åbn browserens menu",
    },
    {
      icon: <Plus className="w-4 h-4" />,
      label: "Tilføj til hjemmeskærm",
      description: "Find \"Tilføj til hjemmeskærm\"",
    },
    {
      icon: <span className="text-sm font-semibold">OK</span>,
      label: "Bekræft",
      description: "Bekræft installationen",
    },
  ];
}

// Get browser display name
function getBrowserName(browser: Browser): string {
  switch (browser) {
    case "safari": return "Safari";
    case "chrome": return "Chrome";
    case "firefox": return "Firefox";
    case "edge": return "Edge";
    case "samsung": return "Samsung Internet";
    case "opera": return "Opera";
    default: return "din browser";
  }
}

function InstallGuideModal({ platform, browser, onClose, onDismiss }: InstallGuideModalProps) {
  const steps = getInstallSteps(platform, browser);
  const browserName = getBrowserName(browser);

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
          <div>
            <h3 className="font-semibold text-lg">Installer app</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Guide til {browserName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-4 space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <div
                className={cn(
                  "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
                  index === steps.length - 1
                    ? "bg-india-green/10"
                    : "bg-saffron/10"
                )}
              >
                {index === steps.length - 1 ? (
                  <span className="text-india-green font-bold text-sm">✓</span>
                ) : (
                  <span className="text-saffron font-bold text-sm">{index + 1}</span>
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted rounded text-sm font-medium">
                    {step.icon}
                    {step.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Tip for non-Safari iOS */}
        {platform === "ios" && browser !== "safari" && (
          <div className="mx-4 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              💡 <strong>Tip:</strong> Safari giver den bedste app-oplevelse på iPhone/iPad
            </p>
          </div>
        )}

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
