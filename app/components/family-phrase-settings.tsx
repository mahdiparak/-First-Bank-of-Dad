"use client";

import { useState } from "react";
import { hasParentPinGate, verifyParentPin } from "@/lib/parent-auth";
import type { FamilyBankState } from "@/lib/schema";
import { InfoTooltip } from "./info-tooltip";

/**
 * Lets a parent deliberately set a new, easy-to-type Family Phrase instead of being stuck with
 * whatever was typed at first setup. The old phrase is never stored anywhere (by design — see
 * lib/crypto.ts), so this can only set a new one, not reveal the current one; typing it here is
 * masked by default, with a PIN-gated eye toggle so a parent can double-check it without anyone
 * looking over their shoulder reading it off the screen.
 */
export function FamilyPhraseSettings({
  state,
  onChangePhrase,
}: {
  state: FamilyBankState;
  onChangePhrase: (phrase: string) => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [visible, setVisible] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleToggleReveal() {
    if (visible) {
      setVisible(false);
      return;
    }
    if (!hasParentPinGate(state)) {
      setVisible(true);
      return;
    }
    setPinError(null);
    setPinPrompt(true);
  }

  async function handlePinSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await verifyParentPin(state, pin);
    setPin("");
    if (result.ok) {
      setVisible(true);
      setPinPrompt(false);
    } else {
      setPinError("Wrong PIN.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (phrase.trim().length < 8) {
      setError("Use a longer Family Phrase (8+ characters) — it's your only encryption key.");
      return;
    }
    if (
      !window.confirm(
        "This changes the sync phrase for the whole family. Every other device (a co-parent's phone, a kid's tablet) needs to be given this exact new phrase to keep syncing — they won't update on their own. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await onChangePhrase(phrase.trim());
      setMessage("Family Phrase changed — this device is re-syncing under the new phrase now.");
      setPhrase("");
      setVisible(false);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="flex items-center font-semibold">
        Family Phrase
        <InfoTooltip label="What is the Family Phrase?">
          <p>
            The one thing every device in your family needs to type in, exactly, to see the same
            balances — never sent anywhere or stored on a server, only ever used on-device to
            unlock your data.
          </p>
          <p>
            Changing it here re-syncs this device under the new phrase and sends it your current
            data, so it becomes the starting point for whoever joins next. Every other device
            needs the same new phrase — they won&apos;t pick it up automatically.
          </p>
        </InfoTooltip>
      </h2>
      <p className="text-xs opacity-60">
        Pick something easy to type correctly on a phone keyboard — a memorable phrase beats a
        complex password here, since a single typo silently lands on a different, empty family
        instead of showing an error.
      </p>

      {pinPrompt ? (
        <form onSubmit={handlePinSubmit} className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="Parent PIN"
            className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
            autoFocus
          />
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
            Unlock
          </button>
          <button type="button" onClick={() => setPinPrompt(false)} className="text-xs opacity-60">
            Cancel
          </button>
          {pinError && <p className="w-full text-sm text-red-500">{pinError}</p>}
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <RevealInputWithGatedEye
            value={phrase}
            onChange={setPhrase}
            visible={visible}
            onToggleVisible={handleToggleReveal}
            placeholder="New Family Phrase"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            Change phrase
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-xs opacity-60">{message}</p>}
    </section>
  );
}

/** Same look as RevealInput, but the eye toggle is controlled by the parent (PIN-gated) rather than owning its own state. */
function RevealInputWithGatedEye({
  value,
  onChange,
  visible,
  onToggleVisible,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        className="w-full rounded-md border border-black/20 px-3 py-2 pr-9 text-sm dark:border-white/20 dark:bg-transparent"
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "Hide value" : "Show value"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-sm opacity-60"
      >
        {visible ? "🙈" : "👁️"}
      </button>
    </div>
  );
}
