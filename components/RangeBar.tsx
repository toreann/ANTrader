import { rangePosition } from "@/lib/format";

/**
 * Where the last price sits between the 24h low and high.
 *
 * This is what turns two numbers into a judgement: "BTC is pinned near the top
 * of its range" is legible at a glance in a way that reading 72,205 / 79,500 /
 * 77,080 and doing the arithmetic is not.
 */
export function RangeBar({
  last,
  low,
  high,
}: {
  last: number;
  low: number;
  high: number;
}) {
  const position = rangePosition(last, low, high);
  if (position === null) return <span className="text-term-dim">—</span>;

  const pct = position * 100;
  return (
    <div
      className="relative h-1 w-full min-w-14 rounded-full bg-term-border"
      role="img"
      aria-label={`${pct.toFixed(0)}% of the 24h range`}
      title={`${pct.toFixed(1)}% of the 24h range`}
    >
      {/* Filled portion reads as "distance travelled up from the low". */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-term-border-hi"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-term-text ring-2 ring-term-panel"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
