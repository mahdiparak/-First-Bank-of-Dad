"use client";

import type { GoalSchedule } from "@/lib/goal-schedule";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function monthGrid(year: number, month: number): (Date | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * A one-month calendar view of a goal's savings schedule — the month the goal's expected
 * completion date falls in, with paydays leading up to it marked and the finish day highlighted.
 */
export function GoalCalendar({ schedule, young = false }: { schedule: GoalSchedule; young?: boolean }) {
  const completion = schedule.completionDate;
  const cells = monthGrid(completion.getFullYear(), completion.getMonth());
  const paydayKeys = new Set(schedule.paydays.map(dateKey));
  const completionKey = dateKey(completion);
  const todayKey = dateKey(new Date());
  const weeks = schedule.weeksToGo;

  return (
    <div className={`rounded-2xl border border-black/10 p-3 dark:border-white/10 ${young ? "rounded-3xl p-4" : ""}`}>
      <p className={`text-center font-semibold ${young ? "text-base" : "text-sm"}`}>
        {MONTH_LABELS[completion.getMonth()]} {completion.getFullYear()}
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="text-xs opacity-50">
            {label}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={i} />;
          const key = dateKey(date);
          const isCompletion = key === completionKey;
          const isPayday = !isCompletion && paydayKeys.has(key);
          const isToday = key === todayKey;
          return (
            <span
              key={i}
              className={`mx-auto flex items-center justify-center rounded-full ${young ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs"} ${
                isCompletion
                  ? "bg-green-500 font-bold text-white"
                  : isPayday
                    ? "bg-black/10 font-medium dark:bg-white/15"
                    : ""
              } ${isToday ? "ring-2 ring-blue-400" : ""}`}
            >
              {isCompletion ? "🎯" : date.getDate()}
            </span>
          );
        })}
      </div>
      <p className={`mt-2 text-center ${young ? "text-sm" : "text-xs"} opacity-70`}>
        🎯 {completion.toLocaleDateString("en-US", { month: "long", day: "numeric" })} — about {weeks} payday
        {weeks === 1 ? "" : "s"} from now
      </p>
    </div>
  );
}
