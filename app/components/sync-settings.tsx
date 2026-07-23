"use client";

import { useEffect, useState } from "react";
import { loadDefaultRoomId, loadRoomId } from "@/lib/storage";
import { InfoTooltip } from "./info-tooltip";

/**
 * The sync "room" defaults to a value derived from the Family Phrase (never shown or editable
 * during onboarding — it happens invisibly). This lets a parent see and, if needed, override it
 * afterward — e.g. to deliberately split devices into separate sync groups. Every device meant
 * to sync together needs the exact same value.
 */
export function SyncSettings({ onSave }: { onSave: (roomId: string) => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([loadRoomId(), loadDefaultRoomId()]).then(([room, def]) => {
      setCurrent(room);
      setDefaultId(def);
      setInput(room ?? "");
    });
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || trimmed === current) return;
    onSave(trimmed);
    setCurrent(trimmed);
    setMessage("Sync room updated — reconnecting on this device.");
  }

  function handleUseDefault() {
    if (!defaultId) return;
    setInput(defaultId);
    onSave(defaultId);
    setCurrent(defaultId);
    setMessage("Back to the default room from your Family Phrase.");
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="flex items-center font-semibold">
        Sync Room
        <InfoTooltip label="What is a Sync Room?">
          <p>
            Every device (yours, your co-parent&apos;s, a kid&apos;s tablet) that should see the
            same balances needs this exact same Room ID — it&apos;s how they find each other.
          </p>
          <p>
            Normally you never touch this — it&apos;s derived automatically from your Family
            Phrase. Only change it if you deliberately want to split some devices into a separate,
            unlinked sync group.
          </p>
          <p>
            If a device isn&apos;t syncing, this is the first thing to check — compare the
            &quot;Current&quot; value below across devices.
          </p>
        </InfoTooltip>
      </h2>
      <p className="text-xs opacity-60">
        Devices only sync with each other when they&apos;re in the same room. This defaults to a
        value derived from your Family Phrase, but you can override it — e.g. to deliberately run
        separate sync groups. Every device that should sync together needs this exact same value.
        Just want an easier phrase for everyone to type? Use Family Phrase above instead — this
        field alone won&apos;t change your encryption key.
      </p>
      {current && (
        <p className="break-all text-xs opacity-60">
          Current: {current}
          {defaultId && current !== defaultId && " (custom)"}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Room ID"
          className="min-w-0 flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
          Save
        </button>
        {defaultId && defaultId !== current && (
          <button
            type="button"
            onClick={handleUseDefault}
            className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
          >
            Use default
          </button>
        )}
      </form>
      {message && <p className="text-xs opacity-60">{message}</p>}
    </section>
  );
}
