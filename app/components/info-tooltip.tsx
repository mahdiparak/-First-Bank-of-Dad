"use client";

import { useState } from "react";

/** A tap-to-toggle "i" info button — no hover dependency, so it works the same on touch devices. */
export function InfoTooltip({ label = "More info", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/30 text-[10px] font-semibold leading-none opacity-70 dark:border-white/30"
      >
        i
      </button>
      {open && (
        <span className="absolute left-0 top-6 z-20 block w-64 space-y-1 rounded-md border border-black/10 bg-white p-3 text-xs leading-relaxed text-black shadow-lg dark:border-white/10 dark:bg-neutral-900 dark:text-white">
          {children}
          <button type="button" onClick={() => setOpen(false)} className="block pt-1 text-xs underline opacity-70">
            Got it
          </button>
        </span>
      )}
    </span>
  );
}
