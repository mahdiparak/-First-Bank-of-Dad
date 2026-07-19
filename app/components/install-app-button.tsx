"use client";

import { useEffect, useState } from "react";

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

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
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

  if (installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    if (isIOS()) {
      setShowIOSHelp(true);
      return;
    }
    setShowIOSHelp(true); // generic fallback instructions for browsers with no prompt API
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
      >
        📲 Add to Home Screen
      </button>
      {showIOSHelp && (
        <p className="max-w-xs text-xs opacity-70">
          {isIOS()
            ? 'Tap the Share icon in your browser toolbar, then "Add to Home Screen."'
            : 'Open your browser menu and look for "Add to Home Screen" or "Install app."'}{" "}
          <button onClick={() => setShowIOSHelp(false)} className="underline">
            Got it
          </button>
        </p>
      )}
    </div>
  );
}
