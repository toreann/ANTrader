/**
 * Number presentation for a trading table.
 *
 * The rule that matters: price decimals come from the symbol's tickSize, never
 * from a hardcoded constant. BTCUSDT ticks in 0.01 (2 dp) while DOGEUSDT ticks
 * in 0.00001 (5 dp) — a blanket toFixed(2) renders small-cap pairs as "0.21"
 * and throws away the digits a trader is actually watching.
 */

/** Price with exactly the precision the exchange quotes it in. */
export function formatPrice(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Absolute change, always signed so the direction reads without the color. */
export function formatChange(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** Quote volume, compacted — "3.22B" reads faster than "3219691654.04". */
export function formatVolume(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [threshold, suffix] of units) {
    if (value >= threshold) return `${(value / threshold).toFixed(2)}${suffix}`;
  }
  return value.toFixed(2);
}

/** Where the last price sits inside the 24h range, clamped to 0..1. */
export function rangePosition(
  last: number,
  low: number,
  high: number,
): number | null {
  if (![last, low, high].every(Number.isFinite)) return null;
  // A flat range would divide by zero; a pair that has not moved all day sits
  // legitimately in the middle.
  if (high <= low) return 0.5;
  return Math.min(1, Math.max(0, (last - low) / (high - low)));
}

/** Split "BTCUSDT" into "BTC" / "USDT" for display, given known metadata. */
export function formatPair(base: string, quote: string): string {
  return `${base}/${quote}`;
}

export function formatClock(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Date(timestamp).toLocaleTimeString("en-US", { hour12: false });
}
