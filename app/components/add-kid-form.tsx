"use client";

import { useState } from "react";

export interface AddKidFormValues {
  name: string;
  age: number;
  weeklyAllowance: number;
  paydayWeekday: number;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function AddKidForm({ onSubmit }: { onSubmit: (values: AddKidFormValues) => void }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weeklyAllowance, setWeeklyAllowance] = useState("");
  const [paydayWeekday, setPaydayWeekday] = useState("5");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !age || !weeklyAllowance) return;
    onSubmit({
      name: name.trim(),
      age: Number(age),
      weeklyAllowance: Number(weeklyAllowance),
      paydayWeekday: Number(paydayWeekday),
    });
    setName("");
    setAge("");
    setWeeklyAllowance("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Add a kid</h2>
      <div className="flex flex-wrap gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
        <input
          value={age}
          onChange={(event) => setAge(event.target.value)}
          type="number"
          min={0}
          placeholder="Age"
          className="w-20 rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
        <input
          value={weeklyAllowance}
          onChange={(event) => setWeeklyAllowance(event.target.value)}
          type="number"
          min={0}
          step="0.01"
          placeholder="Weekly allowance ($)"
          className="w-44 rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
        <select
          value={paydayWeekday}
          onChange={(event) => setPaydayWeekday(event.target.value)}
          className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        >
          {WEEKDAYS.map((label, index) => (
            <option key={label} value={index}>
              Payday: {label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
        Add kid
      </button>
    </form>
  );
}
