"use client";

import { useEffect, useState } from "react";
import { notificationPermission, requestNotificationPermission } from "@/lib/push-notifications";
import { kidAvatar, parentAvatar, type FamilyBankState } from "@/lib/schema";
import { usePwaInstall } from "@/lib/use-pwa-install";
import { ParentLoginPrompt } from "./role-gate";
import { ReconnectPanel } from "./reconnect-panel";

/**
 * The top-right identity chip. Deliberately identity-only — who is using this device, and (from
 * Kid View) the PIN-gated switch back to Parent. All *editing* of people (names, emails, PINs)
 * lives in ⚙️ Settings → 👤 Profile so there's exactly one place to manage the family.
 */
export function ProfilePanel({
  state,
  role,
  deviceParentId,
  deviceKidId,
  onSetDeviceParentId,
  onSwitchToParent,
  onReconnect,
}: {
  state: FamilyBankState;
  role: "parent" | "kid";
  deviceParentId: string | null;
  deviceKidId: string | null;
  onSetDeviceParentId: (parentId: string) => void;
  onSwitchToParent: (parentId?: string) => void;
  /** Re-point THIS device at a different Family Phrase + room without touching its local
   *  identity — the fix for a device that's stuck on a stale/wrong room (e.g. missed a phrase
   *  change while offline). Available to both roles since only a parent's Settings tab has the
   *  full "change phrase" flow, but any device can need to reconnect. */
  onReconnect: (phrase: string, roomName: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [switchingToParent, setSwitchingToParent] = useState(false);

  const currentParent = deviceParentId ? state.parentProfiles.find((parent) => parent.id === deviceParentId) : null;
  const currentKid = deviceKidId ? state.kids.find((kid) => kid.id === deviceKidId) : null;

  function close() {
    setOpen(false);
    setSwitchingToParent(false);
  }

  function handleSwitchSuccess(parentId?: string) {
    close();
    onSwitchToParent(parentId);
  }

  const buttonGlyph =
    role === "parent" ? (currentParent ? parentAvatar(currentParent) : "👤") : currentKid ? kidAvatar(currentKid) : "👤";

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Profile"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 text-lg dark:border-white/20"
      >
        {buttonGlyph}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-72 space-y-3 rounded-xl border border-black/10 bg-white p-4 text-sm text-black shadow-lg dark:border-white/10 dark:bg-neutral-900 dark:text-white">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Profile</p>
            <button type="button" onClick={close} className="text-xs opacity-60 underline">
              Close
            </button>
          </div>

          <InstallAppButton />

          {role === "parent" ? (
            <div className="space-y-3">
              {state.parentProfiles.length > 0 ? (
                <label className="flex flex-col gap-1 text-xs opacity-70">
                  Who&apos;s using this device?
                  <select
                    value={currentParent?.id ?? ""}
                    onChange={(event) => onSetDeviceParentId(event.target.value)}
                    className="rounded-md border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
                  >
                    <option value="">Not set</option>
                    {state.parentProfiles.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parentAvatar(parent)} {parent.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs opacity-60">No parents named yet.</p>
              )}
              <p className="text-xs opacity-60">
                Edit names, emails, and PINs in ⚙️ Settings → 👤 Profile.
              </p>
              <NotificationToggle
                grantedText="🔔 You'll get a nudge when a kid claims a quest."
                promptText="🔔 Get notified when a kid claims a quest"
                deniedText="🔕 Notifications are blocked — turn them on for this site in your browser settings to get nudged when a kid claims a quest."
              />
              <ReconnectPanel onReconnect={onReconnect} />
            </div>
          ) : (
            <div className="space-y-2">
              {currentKid && (
                <p className="text-xs opacity-60">
                  Signed in as {kidAvatar(currentKid)} {currentKid.name}.
                </p>
              )}
              <NotificationToggle
                grantedText="🔔 You'll get a nudge when a new quest is posted."
                promptText="🔔 Get notified about new quests"
                deniedText="🔕 Notifications are blocked — turn them on for this site in your browser settings to get nudged about new quests."
              />
              {switchingToParent ? (
                <ParentLoginPrompt state={state} onSuccess={handleSwitchSuccess} onCancel={() => setSwitchingToParent(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setSwitchingToParent(true)}
                  className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
                >
                  Switch to Parent
                </button>
              )}
              <ReconnectPanel onReconnect={onReconnect} />
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/** Lets either a kid or a parent opt in to a real OS notification — new quests for a kid,
 *  claimed quests awaiting approval for a parent. See lib/push-notifications.ts. */
function NotificationToggle({
  grantedText,
  promptText,
  deniedText,
}: {
  grantedText: string;
  promptText: string;
  deniedText: string;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => notificationPermission());
  const [checked, setChecked] = useState(false);

  // The lazy initializer above already reads the real value on the client; this effect just
  // defers rendering it until after hydration, so server and client agree on the first paint.
  useEffect(() => {
    queueMicrotask(() => setChecked(true));
  }, []);

  if (!checked || permission === "unsupported") return null;

  if (permission === "granted") {
    return <p className="text-xs opacity-60">{grantedText}</p>;
  }

  if (permission === "denied") {
    return <p className="text-xs opacity-60">{deniedText}</p>;
  }

  async function handleEnable() {
    setPermission(await requestNotificationPermission());
  }

  return (
    <button
      type="button"
      onClick={() => void handleEnable()}
      className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
    >
      {promptText}
    </button>
  );
}

/**
 * Always-available way to install the app, independent of the top InstallBanner — a dismissed
 * banner is permanently gone on that device by design, and the browser's own native install
 * prompt can be slow to appear (or never appears at all on iOS). Hidden once already installed.
 */
function InstallAppButton() {
  const { installed, isIOS, canPromptNatively, promptInstall } = usePwaInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (canPromptNatively ? void promptInstall() : setShowInstructions(true))}
        className="w-full rounded-md border border-black/20 px-3 py-2 text-left text-sm dark:border-white/20"
      >
        📲 Install app
      </button>
      {showInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setShowInstructions(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm space-y-2 rounded-xl border border-black/10 bg-white p-4 text-sm leading-relaxed text-black shadow-xl dark:border-white/10 dark:bg-neutral-900 dark:text-white"
          >
            {isIOS ? (
              <p>
                Tap the <strong>Share</strong> icon in Safari, then choose{" "}
                <strong>&quot;Add to Home Screen.&quot;</strong>
              </p>
            ) : (
              <p>
                Open your browser menu and choose <strong>&quot;Add to Home screen&quot;</strong> or{" "}
                <strong>&quot;Install app.&quot;</strong>
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="mt-2 w-full rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
