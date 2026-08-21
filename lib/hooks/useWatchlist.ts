"use client";

import { useCallback, useEffect, useState } from "react";
import { moveItem } from "@/lib/reorder";

const STORAGE_KEY = "antrader.watchlist.v1";
export const DEFAULT_WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function readStored(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const symbols = parsed.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    return symbols.length > 0 ? symbols : null;
  } catch {
    return null;
  }
}

/**
 * The watchlist, persisted to localStorage.
 *
 * Returns `null` until the stored value has been read. Reading localStorage
 * during render would desync server and client HTML, and seeding with the
 * defaults first would both flash the wrong rows and open a socket for pairs
 * the user does not actually watch.
 */
export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[] | null>(null);

  useEffect(() => {
    setSymbols(readStored() ?? DEFAULT_WATCHLIST);
  }, []);

  const persist = useCallback((next: string[]) => {
    setSymbols(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota: keep the in-memory list working.
    }
  }, []);

  const add = useCallback(
    (symbol: string) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper) return;
      setSymbols((current) => {
        const base = current ?? DEFAULT_WATCHLIST;
        if (base.includes(upper)) return base;
        const next = [...base, upper];
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const remove = useCallback((symbol: string) => {
    setSymbols((current) => {
      const base = current ?? DEFAULT_WATCHLIST;
      // Never empty the list — an empty watchlist means no socket and a blank screen.
      if (base.length <= 1) return base;
      const next = base.filter((s) => s !== symbol);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setSymbols((current) => {
      const base = current ?? DEFAULT_WATCHLIST;
      const next = moveItem(base, from, to);
      if (next === base) return base;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { symbols, add, remove, reorder, persist };
}
