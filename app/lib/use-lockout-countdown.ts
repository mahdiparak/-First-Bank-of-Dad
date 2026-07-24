"use client";

import { useEffect, useRef, useState } from "react";

/** Ticks a lockout's remaining time down to zero every second, so a PIN form can show a live
 *  countdown and re-enable itself the moment it expires instead of needing a manual retry/reload. */
export function useLockoutCountdown(remainingMs: number): number {
  // Resets local state when the caller reports a new lockout — done during render (React's
  // recommended way to adjust state from a changed prop) rather than in an effect, so a fresh
  // remainingMs value takes effect immediately instead of one render late.
  const [prevRemainingMs, setPrevRemainingMs] = useState(remainingMs);
  const [remaining, setRemaining] = useState(remainingMs);
  if (remainingMs !== prevRemainingMs) {
    setPrevRemainingMs(remainingMs);
    setRemaining(remainingMs);
  }

  const locked = remaining > 0;
  // The interval only needs to start/stop on the locked/unlocked transition, not on every tick —
  // read the live value through a ref (kept in sync via its own effect, never written during
  // render) so it doesn't have to be a dependency.
  const remainingRef = useRef(remaining);
  useEffect(() => {
    remainingRef.current = remaining;
  });

  useEffect(() => {
    if (!locked) return;
    const interval = setInterval(() => {
      setRemaining(Math.max(0, remainingRef.current - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [locked]);

  return remaining;
}

export function formatLockoutRemaining(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
