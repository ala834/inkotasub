import { useState, useEffect, useCallback } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/common/AppLogo";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).standalone;
    setIsIOS(ios);

    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!standalone) setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Show iOS prompt after delay if not installed
    if (ios && !standalone) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => { clearTimeout(timer); window.removeEventListener("beforeinstallprompt", handler); };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  }, []);

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-2xl p-4 shadow-lg max-w-md mx-auto">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <AppLogo className="w-12 h-12" />
          <div>
            <h3 className="font-display font-bold text-foreground text-sm">
              Install Inkotasub
            </h3>
            <p className="text-xs text-muted-foreground">
              Add to home screen for the best experience
            </p>
          </div>
        </div>

        {isIOS ? (
          <div className="bg-muted rounded-xl p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              Tap <Share className="h-3.5 w-3.5 inline text-primary" /> then
              <span className="font-semibold text-foreground">"Add to Home Screen"</span>
            </p>
          </div>
        ) : (
          <Button
            onClick={handleInstall}
            className="w-full gradient-primary text-primary-foreground rounded-xl h-10"
          >
            <Download className="mr-2 h-4 w-4" />
            Install App
          </Button>
        )}
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
