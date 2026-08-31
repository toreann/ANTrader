"use client";

import { useCallback, useEffect, useState } from "react";
import { moveItem } from "@/lib/reorder";
import {
  DEFAULT_WATCHLIST,
  entryKey,
  parseEntries,
  serializeEntries,
  type WatchEntry,
} from "@/lib/watchlist";

const STORAGE_KEY = "antrader.watchlist.v1";

function readStored(): WatchEntry[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entries = parseEntries(JSON.parse(raw));
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

function write(entries: WatchEntry[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(serializeEntries(entries)),
    );
  } catch {
    // Private browsing or a full quota: keep the in-memory list working.
  }
}

/**
 * The watchlist, persisted to localStorage.
 *
 * Returns `null` until the stored value has been read. Reading localStorage
 * during render would desync server and client HTML, and seeding with the
 * defaults first would both flash the wrong tiles and start fetching pairs the
 * user does not actually watch.
 *
 * The storage key is deliberately unchanged from the Binance-only version:
 * `parseEntries` reads a bare `"BTCUSDT"` as a Binance entry, so an existing
 * watchlist migrates on read with no versioning step.
 */
export function useWatchlist() {
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);

  useEffect(() => {
    setEntries(readStored() ?? DEFAULT_WATCHLIST);
  }, []);

  const add = useCallback((entry: WatchEntry) => {
    setEntries((current) => {
      const base = current ?? DEFAULT_WATCHLIST;
      if (base.some((e) => entryKey(e) === entryKey(entry))) return base;
      const next = [...base, entry];
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => {
    setEntries((current) => {
      const base = current ?? DEFAULT_WATCHLIST;
      // Never empty the list — that means no data and a blank screen.
      if (base.length <= 1) return base;
      const next = base.filter((e) => entryKey(e) !== key);
      write(next);
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setEntries((current) => {
      const base = current ?? DEFAULT_WATCHLIST;
      const next = moveItem(base, from, to);
      if (next === base) return base;
      write(next);
      return next;
    });
  }, []);

  return { entries, add, remove, reorder };
}
