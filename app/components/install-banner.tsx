"use client";

import { useEffect, useState } from "react";
import { loadInstallBannerDismissed, saveInstallBannerDismissed } from "@/lib/storage";
import { usePwaInstall } from "@/lib/use-pwa-install";

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * A persistent top banner rather than a buried settings button, so it actually gets seen on
 * every device type this family uses: Android/Chrome gets a real one-tap native install prompt;
 * iPhone Safari and Amazon Fire's Silk browser never fire beforeinstallprompt at all, so they
 * get manual step-by-step instructions instead.
 *
 * Dismissing this is permanent (device-local) by design, so it doesn't nag forever — the profile
 * menu's install icon (see components/profile-panel.tsx) is the always-available way back in if
 * someone dismisses this before actually installing, or the browser is slow to offer the prompt.
 */
export function InstallBanner() {
  const { installed, canPromptNatively, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void loadInstallBannerDismissed().then((value) => {
      setDismissed(value);
      setChecked(true);
    });
  }, []);

  function handleDismiss() {
    setDismissed(true);
    void saveInstallBannerDismissed(true);
  }

  if (!checked || installed || dismissed) return null;

  return (
    <div className="flex items-center gap-3 bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black">
      <span className="flex-1">
        {canPromptNatively
          ? "📲 Install this app for quick, full-screen access."
          : isIOS()
            ? '📲 Add to Home Screen: tap the Share icon, then "Add to Home Screen."'
            : '📲 Add this app to your Home Screen — open your browser menu and choose "Add to Home screen" or "Install app" (Android, Amazon Fire tablets, iPhone).'}
      </span>
      {canPromptNatively && (
        <button
          onClick={() => void promptInstall()}
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
