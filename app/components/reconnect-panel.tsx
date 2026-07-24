"use client";

import { useState } from "react";
import { RevealInput } from "./reveal-input";

/**
 * Lets ANY already-set-up device — a kid's own device, or a second parent's — point itself at a
 * different Family Phrase + room. Unlike onboarding's "Join my family" (which asks a parent to
 * approve a brand-new device), this is for a device that's already part of the family but is
 * synced to the wrong room: e.g. a parent changed the Family Phrase from Settings while this
 * device was closed/offline and never picked up the broadcast. This device's own identity (role,
 * PIN, kid/parent selection) is left untouched — only the sync channel changes.
 */
export function ReconnectPanel({
  onReconnect,
}: {
  onReconnect: (phrase: string, roomName: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [roomName, setRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (phrase.trim().length < 8) {
      setError("Enter the full Family Phrase (8+ characters).");
      return;
    }
    if (!roomName.trim()) {
      setError("Enter the family room name too.");
      return;
    }
    if (
      !window.confirm(
        "This points THIS device at a different Family Phrase and room. Your PIN and profile on this device stay the same — only what data it syncs to changes. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await onReconnect(phrase.trim(), roomName.trim());
      setMessage("Reconnected — check the sync dot at the top. It can take a few seconds to catch up.");
      setPhrase("");
      setRoomName("");
      setOpen(false);
    } catch (reconnectError) {
      setError(reconnectError instanceof Error ? reconnectError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={() => setOpen(true)} className="text-xs opacity-60 underline">
          Sync not working? Reconnect with a Family Phrase
        </button>
        {message && <p className="text-xs opacity-60">{message}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <p className="text-xs font-medium">Reconnect this device</p>
      <p className="text-xs opacity-60">
        Get the exact Family Phrase and room name from a parent, then enter them below. Double-check
        with 👁️ before submitting — a phone keyboard auto-capitalizing or autocorrecting even one
        letter silently connects you to the wrong (empty) room instead of showing an error.
      </p>
      <RevealInput
        value={phrase}
        onChange={setPhrase}
        placeholder="Family Phrase"
        className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      />
      <input
        value={roomName}
        onChange={(event) => setRoomName(event.target.value)}
        placeholder="Family room name"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-black px-3 py-2 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Reconnecting…" : "Reconnect"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs opacity-70">
          Cancel
        </button>
      </div>
    </form>
  );
}
