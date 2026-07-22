"use client";

import { useEffect, useState } from "react";
import { notificationPermission, requestNotificationPermission } from "@/lib/push-notifications";
import { kidAvatar, parentAvatar, type FamilyBankState } from "@/lib/schema";
import { ParentLoginPrompt } from "./role-gate";

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
}: {
  state: FamilyBankState;
  role: "parent" | "kid";
  deviceParentId: string | null;
  deviceKidId: string | null;
  onSetDeviceParentId: (parentId: string) => void;
  onSwitchToParent: (parentId?: string) => void;
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
            </div>
          ) : (
            <div className="space-y-2">
              {currentKid && (
                <p className="text-xs opacity-60">
                  Signed in as {kidAvatar(currentKid)} {currentKid.name}.
                </p>
              )}
              <NotificationToggle />
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
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/** Lets a kid opt in to a real OS notification when a new quest is posted — see lib/push-notifications.ts. */
function NotificationToggle() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => notificationPermission());
  const [checked, setChecked] = useState(false);

  // The lazy initializer above already reads the real value on the client; this effect just
  // defers rendering it until after hydration, so server and client agree on the first paint.
  useEffect(() => {
    queueMicrotask(() => setChecked(true));
  }, []);

  if (!checked || permission === "unsupported") return null;

  if (permission === "granted") {
    return <p className="text-xs opacity-60">🔔 You&apos;ll get a nudge when a new quest is posted.</p>;
  }

  if (permission === "denied") {
    return (
      <p className="text-xs opacity-60">
        🔕 Notifications are blocked — turn them on for this site in your browser settings to get nudged about new
        quests.
      </p>
    );
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
      🔔 Get notified about new quests
    </button>
  );
}
