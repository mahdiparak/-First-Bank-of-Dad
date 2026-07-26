"use client";

import { useMemo, useState } from "react";
import { MONTH_LABELS } from "./calendar";

/**
 * The two things every long list in this app needs: a way to jump to a month, and a way to not
 * render four years of history at once. Both live here so the Ledger, the Activity log, the
 * holdings list and the rest behave the same way — same controls, same wording, same keyboard
 * targets — rather than each growing its own.
 */

export const ALL = "all" as const;
export type MonthValue = number | typeof ALL;
export type YearValue = number | typeof ALL;

export type MonthFilter = {
  year: YearValue;
  month: MonthValue;
  setYear: (year: YearValue) => void;
  setMonth: (month: MonthValue) => void;
  /** Every year the data touches, newest first, for the dropdown. */
  years: number[];
  /** Human name for what's on screen: "March 2026", "2026", "All time". */
  label: string;
  /** Step one month back/forward. Null when the control doesn't apply (a whole year, or all time). */
  step: ((delta: number) => void) | null;
};

/**
 * Narrows `items` to one month, one year, or everything. Starts on the current month when there's
 * anything there and on "all time" when there isn't — landing on an empty screen because today
 * happens to be the 2nd of the month is a bad first impression.
 */
export function useMonthFilter<T>(
  items: T[],
  getDate: (item: T) => string,
): MonthFilter & { filtered: T[] } {
  const now = useMemo(() => new Date(), []);

  const times = useMemo(
    () => items.map(getDate).map((raw) => new Date(raw).getTime()).filter(Number.isFinite),
    // getDate is a fresh closure on every render in most callers; items identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  const years = useMemo(() => {
    const seen = new Set<number>(times.map((time) => new Date(time).getFullYear()));
    seen.add(now.getFullYear());
    return [...seen].sort((a, b) => b - a);
  }, [times, now]);

  const hasThisMonth = useMemo(
    () =>
      times.some((time) => {
        const date = new Date(time);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      }),
    [times, now],
  );

  const [pickedYear, setYear] = useState<YearValue>(() => (hasThisMonth ? now.getFullYear() : ALL));
  const [pickedMonth, setMonth] = useState<MonthValue>(() => (hasThisMonth ? now.getMonth() : ALL));

  // A year that no longer exists in the data (its last entry was undone) would otherwise strand the
  // list on an empty page with no obvious way back, so fall back to all time. Derived, not stored:
  // if the year comes back, so does the selection.
  const stranded = pickedYear !== ALL && !years.includes(pickedYear);
  const year: YearValue = stranded ? ALL : pickedYear;
  const month: MonthValue = stranded ? ALL : pickedMonth;

  const filtered = useMemo(() => {
    if (year === ALL) return items;
    return items.filter((item) => {
      const date = new Date(getDate(item));
      if (Number.isNaN(date.getTime())) return false;
      if (date.getFullYear() !== year) return false;
      return month === ALL || date.getMonth() === month;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, year, month]);

  const label = year === ALL ? "All time" : month === ALL ? String(year) : `${MONTH_LABELS[month]} ${year}`;

  // Stepping only makes sense on a single month, and it has to be able to cross a year boundary.
  const step =
    year === ALL || month === ALL
      ? null
      : (delta: number) => {
          const moved = new Date(year, month + delta, 1);
          setYear(moved.getFullYear());
          setMonth(moved.getMonth());
        };

  return { year, month, setYear, setMonth, years, label, step, filtered };
}

/** Year + month dropdowns with ← → arrows, sized for a thumb. */
export function MonthFilterBar({ filter, className = "" }: { filter: MonthFilter; className?: string }) {
  const selectClass =
    "rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <button
        type="button"
        disabled={!filter.step}
        onClick={() => filter.step?.(-1)}
        aria-label="Previous month"
        className="rounded-md px-2 py-1 text-sm opacity-60 hover:opacity-100 disabled:opacity-20"
      >
        ←
      </button>
      <div className="flex items-center gap-2">
        <select
          value={filter.month}
          aria-label="Month"
          onChange={(event) => {
            const value = event.target.value;
            filter.setMonth(value === ALL ? ALL : Number(value));
            // Picking a month while showing every year has to land somewhere; the newest year is
            // the one a parent means.
            if (value !== ALL && filter.year === ALL) filter.setYear(filter.years[0]);
          }}
          className={selectClass}
        >
          <option value={ALL}>All months</option>
          {MONTH_LABELS.map((monthLabel, index) => (
            <option key={monthLabel} value={index}>
              {monthLabel}
            </option>
          ))}
        </select>
        <select
          value={filter.year}
          aria-label="Year"
          onChange={(event) => {
            const value = event.target.value;
            filter.setYear(value === ALL ? ALL : Number(value));
            if (value === ALL) filter.setMonth(ALL);
          }}
          className={selectClass}
        >
          <option value={ALL}>All time</option>
          {filter.years.map((yearOption) => (
            <option key={yearOption} value={yearOption}>
              {yearOption}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={!filter.step}
        onClick={() => filter.step?.(1)}
        aria-label="Next month"
        className="rounded-md px-2 py-1 text-sm opacity-60 hover:opacity-100 disabled:opacity-20"
      >
        →
      </button>
    </div>
  );
}

export type Pager<T> = {
  /** The items to actually render. */
  page: T[];
  pageIndex: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first item on this page, and the last — for "21–40 of 137". */
  from: number;
  to: number;
  setPageIndex: (index: number) => void;
};

/**
 * Cuts a list into pages. Any change to the list's length sends you back to the first page, so
 * filtering to March while parked on page 4 doesn't show an empty screen.
 */
export function usePager<T>(items: T[], pageSize = 20): Pager<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // The chosen page is stored next to the list length it was chosen against. When the length
  // changes — a filter was applied, an entry was undone — the stored index no longer refers to
  // anything the reader picked, so it reads as page one. Derived rather than reset in an effect,
  // which would render one blank frame first.
  const [chosen, setChosen] = useState({ total, index: 0 });
  const current = Math.min(chosen.total === total ? chosen.index : 0, pageCount - 1);
  const setPageIndex = (index: number) => setChosen({ total, index: Math.max(0, index) });

  const start = current * pageSize;
  const page = items.slice(start, start + pageSize);

  return {
    page,
    pageIndex: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    setPageIndex,
  };
}

/**
 * Prev/Next with a count. Renders nothing when everything fits on one page — a pager under a
 * three-item list is noise.
 */
export function PagerBar<T>({
  pager,
  noun = "items",
  className = "",
}: {
  pager: Pager<T>;
  /** Plural noun for the count line, e.g. "entries", "transactions". */
  noun?: string;
  className?: string;
}) {
  if (pager.pageCount <= 1) return null;

  const buttonClass =
    "rounded-md border border-black/20 px-2 py-1 text-xs disabled:opacity-30 dark:border-white/20";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <button
        type="button"
        disabled={pager.pageIndex === 0}
        onClick={() => pager.setPageIndex(pager.pageIndex - 1)}
        className={buttonClass}
      >
        ← Newer
      </button>
      <span className="text-xs opacity-60" aria-live="polite">
        {pager.from}–{pager.to} of {pager.total} {noun}
      </span>
      <button
        type="button"
        disabled={pager.pageIndex >= pager.pageCount - 1}
        onClick={() => pager.setPageIndex(pager.pageIndex + 1)}
        className={buttonClass}
      >
        Older →
      </button>
    </div>
  );
}
