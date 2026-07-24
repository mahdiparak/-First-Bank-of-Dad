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

export interface PwaInstallState {
  /** Already running as the installed app — nothing left to offer. */
  installed: boolean;
  /** iPhone/iPad Safari never fires beforeinstallprompt at all — only manual instructions work. */
  isIOS: boolean;
  /** True once the browser has actually offered a real one-tap install (Android/Chrome/Edge). */
  canPromptNatively: boolean;
  /** Triggers the native prompt. No-op if canPromptNatively is false. */
  promptInstall: () => Promise<void>;
}

/**
 * Shared install-prompt plumbing so every "Install this app" entry point in the UI (the top
 * banner, the profile menu's icon) reflects the same real state instead of each guessing
 * independently — whether it's already installed, and whether the browser has actually made a
 * native prompt available yet (it doesn't on iOS, and even on Android it can take a few visits
 * before the browser's own engagement heuristics decide to offer it).
 */
export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

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

  async function promptInstall(): Promise<void> {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  return {
    installed,
    isIOS: isIOS(),
    canPromptNatively: deferredPrompt !== null,
    promptInstall,
  };
}
