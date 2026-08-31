/**
 * Watchlist entries, which now span two venues.
 *
 * Stored as prefixed strings (`binance:BTCUSDT`, `jupiter:<mint>`) so the
 * persisted shape stays a plain string array and needs no schema versioning.
 * Entries written before Jupiter existed are bare symbols, and are read as
 * Binance — so an existing localStorage watchlist keeps working untouched.
 */
import type { MarketSource } from "./binance/types";

export interface WatchEntry {
  source: MarketSource;
  /** Binance trading pair, or a Solana mint address. */
  id: string;
}

/** Stable string key for React keys, maps and persistence. */
export function entryKey(entry: WatchEntry): string {
  return `${entry.source}:${entry.id}`;
}

export function parseEntry(raw: string): WatchEntry | null {
  const separator = raw.indexOf(":");
  if (separator === -1) {
    // Legacy: a bare pair from before the watchlist knew about venues.
    const id = raw.trim().toUpperCase();
    return id ? { source: "binance", id } : null;
  }
  const source = raw.slice(0, separator);
  const id = raw.slice(separator + 1).trim();
  if (!id) return null;
  if (source === "binance") return { source, id: id.toUpperCase() };
  // Mint addresses are base58 and case-sensitive — never upper-case them.
  if (source === "jupiter") return { source, id };
  return null;
}

export function parseEntries(raw: unknown): WatchEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (typeof value !== "string") return [];
    const entry = parseEntry(value);
    return entry ? [entry] : [];
  });
}

export function serializeEntries(entries: WatchEntry[]): string[] {
  return entries.map(entryKey);
}

export const DEFAULT_WATCHLIST: WatchEntry[] = [
  { source: "binance", id: "BTCUSDT" },
  { source: "binance", id: "ETHUSDT" },
  { source: "binance", id: "SOLUSDT" },
  // Wrapped SOL and JUP, so the Solana side is visible out of the box.
  { source: "jupiter", id: "So11111111111111111111111111111111111111112" },
  { source: "jupiter", id: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
];
