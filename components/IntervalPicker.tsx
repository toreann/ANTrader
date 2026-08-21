"use client";

import { INTERVALS, type Interval } from "@/lib/binance/types";

export function IntervalPicker({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (interval: Interval) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Chart interval"
      className="flex items-center gap-0.5 rounded-md border border-term-border bg-term-bg p-0.5"
    >
      {INTERVALS.map((interval) => (
        <button
          key={interval}
          type="button"
          aria-pressed={value === interval}
          onClick={() => onChange(interval)}
          className={`num rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            value === interval
              ? "bg-term-border-hi text-term-text"
              : "text-term-muted hover:bg-term-panel-hi hover:text-term-text"
          }`}
        >
          {interval}
        </button>
      ))}
    </div>
  );
}
