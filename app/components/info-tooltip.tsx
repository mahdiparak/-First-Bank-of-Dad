"use client";

import { useState } from "react";

/**
 * A tap-to-open "i" info button. Renders its explanation as a fixed, centered overlay with a
 * backdrop (not an inline popover) — an inline popover positioned near a small icon inside a
 * busy form has nowhere reliable to expand into and ends up overlapping the fields around it.
 * A centered overlay always renders cleanly regardless of where the button sits on the page.
 */
export function InfoTooltip({ label = "More info", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/30 align-middle text-[10px] font-semibold leading-none opacity-70 dark:border-white/30"
      >
        i
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm space-y-2 rounded-xl border border-black/10 bg-white p-4 text-sm leading-relaxed text-black shadow-xl dark:border-white/10 dark:bg-neutral-900 dark:text-white"
          >
            {children}
            <button
              type="button"
              onClick={() => setOpen(false)}
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
