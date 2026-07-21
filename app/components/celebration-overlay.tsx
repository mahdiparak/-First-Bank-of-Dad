"use client";

import { useEffect, useMemo, useState } from "react";
import type { CelebrationEvent } from "@/lib/celebrations";

const AUTO_DISMISS_MS = 7000;
const CONFETTI_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444"];

function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let frame: number;
    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min(1, (timestamp - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: `${(i * 137.5) % 100}%`,
        delay: `${(i % 10) * 0.12}s`,
        duration: `${2.2 + (i % 5) * 0.35}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + (i % 3) * 3,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 rounded-sm"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        />
      ))}
    </div>
  );
}

function PaydayBody({ event }: { event: CelebrationEvent }) {
  const gross = useCountUp(event.gross ?? event.amount);
  return (
    <>
      <p className="text-5xl font-bold tabular-nums">{formatCurrency(gross)}</p>
      {event.tax !== undefined && event.tax > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-lg">
          <span className="animate-slide-to-jar inline-block">🪙 {formatCurrency(event.tax)}</span>
          <span className="text-3xl">🫙</span>
        </div>
      )}
      {event.tax !== undefined && event.tax > 0 && (
        <p className="mt-2 text-sm opacity-80">
          {formatCurrency(event.tax)} went to your tax jar — {formatCurrency(event.amount)} is yours!
        </p>
      )}
    </>
  );
}

function DefaultBody({ event }: { event: CelebrationEvent }) {
  const amount = useCountUp(event.amount);
  return (
    <>
      <p className="text-5xl font-bold tabular-nums">+{formatCurrency(amount)}</p>
      {event.detail && <p className="mt-3 text-base opacity-80">{event.detail}</p>}
    </>
  );
}

export function CelebrationOverlay({
  event,
  onDismiss,
}: {
  event: CelebrationEvent;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [event.id, onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onDismiss}
      role="dialog"
      aria-label={event.title}
    >
      <Confetti />
      <div className="animate-pop-in relative max-w-sm rounded-3xl bg-white p-8 text-center text-black shadow-2xl dark:bg-zinc-900 dark:text-white">
        <p className="text-6xl">{event.emoji}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-wide">{event.title}</h2>
        <div className="mt-4">
          {event.kind === "payday" ? <PaydayBody event={event} /> : <DefaultBody event={event} />}
        </div>
        <p className="mt-6 text-xs opacity-50">Tap anywhere to keep going</p>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
