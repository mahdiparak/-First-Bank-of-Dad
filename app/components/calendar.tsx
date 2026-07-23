"use client";

import { useMemo, useState } from "react";

export interface CalendarMarker {
  date: Date;
  content: string;
  title?: string;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A single-month calendar grid with emoji markers on specific days. Markers are recomputed per
 * displayed month via `getMarkers` so navigating months (paydays, streak weeks) always reflects
 * whatever actually falls on that page.
 */
export function MonthCalendar({
  getMarkers,
  initialMonth,
  color = "#22c55e",
  legend,
}: {
  getMarkers: (year: number, month: number) => CalendarMarker[];
  initialMonth?: Date;
  color?: string;
  legend?: React.ReactNode;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    const base = initialMonth ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const markers = useMemo(() => getMarkers(year, month), [getMarkers, year, month]);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="rounded-md px-2 py-1 text-sm opacity-60 hover:opacity-100"
        >
          ←
        </button>
        <p className="text-sm font-semibold">
          {MONTH_LABELS[month]} {year}
        </p>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="rounded-md px-2 py-1 text-sm opacity-60 hover:opacity-100"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] opacity-50">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const dayMarkers = markers.filter((marker) => sameDay(marker.date, date));
          const isToday = sameDay(date, today);
          return (
            <div
              key={date.toISOString()}
              title={dayMarkers.map((marker) => marker.title).filter(Boolean).join(", ") || undefined}
              className="flex aspect-square flex-col items-center justify-center rounded-lg text-xs"
              style={isToday ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
            >
              <span className="opacity-60">{date.getDate()}</span>
              {dayMarkers.length > 0 && <span className="text-sm leading-none">{dayMarkers[0].content}</span>}
            </div>
          );
        })}
      </div>
      {legend && <div className="flex flex-wrap gap-3 text-xs opacity-60">{legend}</div>}
    </div>
  );
}
