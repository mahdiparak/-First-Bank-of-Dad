"use client";

import { useState } from "react";

/** A password-style input with an eye toggle to reveal the plain text — for secrets you need to double-check, not just type blind. */
export function RevealInput({
  value,
  onChange,
  placeholder,
  className = "",
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full pr-9 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide value" : "Show value"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-sm opacity-60"
      >
        {visible ? "🙈" : "👁️"}
      </button>
    </div>
  );
}
