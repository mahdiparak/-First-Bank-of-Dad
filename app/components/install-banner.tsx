"use client";

import { useEffect, useState } from "react";
import { loadInstallBannerDismissed, saveInstallBannerDismissed } from "@/lib/storage";

// Chrome/Android/Edge fire this event when the page qualifies as installable; it's not
// in the standard TS lib yet, so the shape is declared locally.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * A persistent top banner rather than a buried settings button, so it actually gets seen on
 * every device type this family uses: Android/Chrome gets a real one-tap native install prompt;
 * iPhone Safari and Amazon Fire's Silk browser never fire beforeinstallprompt at all, so they
 * get manual step-by-step instructions instead.
 */
export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [dismissed, setDismissed] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void loadInstallBannerDismissed().then((value) => {
      setDismissed(value);
      setChecked(true);
    });

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  function handleDismiss() {
    setDismissed(true);
    void saveInstallBannerDismissed(true);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  if (!checked || installed || dismissed) return null;

  return (
    <div className="flex items-center gap-3 bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black">
      <span className="flex-1">
        {deferredPrompt
          ? "📲 Install this app for quick, full-screen access."
          : isIOS()
            ? '📲 Add to Home Screen: tap the Share icon, then "Add to Home Screen."'
            : '📲 Add this app to your Home Screen — open your browser menu and choose "Add to Home screen" or "Install app" (Android, Amazon Fire tablets, iPhone).'}
      </span>
      {deferredPrompt && (
        <button
          onClick={() => void handleInstallClick()}
          className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-black dark:bg-black dark:text-white"
        >
          Install
        </button>
      )}
      <button onClick={handleDismiss} aria-label="Dismiss" className="shrink-0 text-lg leading-none opacity-70">
        ×
      </button>
    </div>
  );
}
