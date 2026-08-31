"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchBinanceSymbols } from "@/lib/binance/rest";
import { searchJupiterTokens } from "@/lib/jupiter/rest";
import { VenueBadge } from "@/components/VenueBadge";
import { formatVolume } from "@/lib/format";
import type { RawJupiterToken } from "@/lib/jupiter/types";
import type { WatchEntry } from "@/lib/watchlist";

const DEBOUNCE_MS = 250;
const PER_VENUE = 4;

/** One row in the results list, from either venue. */
type Result =
  | { source: "binance"; id: string; title: string; subtitle: string; meta: string }
  | {
      source: "jupiter";
      id: string;
      title: string;
      subtitle: string;
      meta: string;
      verified: boolean;
    };

/**
 * One search box across both venues.
 *
 * Deliberately venue-agnostic: the user is looking for a market, not choosing an
 * API. Typing "SOL" should surface Binance's SOLUSDT and Solana's SOL token side
 * by side, each labelled, and picking either adds it. A venue toggle made the
 * user answer a question they should not have to care about.
 *
 * Both venues are searched in parallel and rendered as one list. Failures are
 * per-venue: if Jupiter is unreachable, Binance results still appear.
 */
export function SymbolManager({
  existingKeys,
  onAdd,
}: {
  existingKeys: string[];
  onAdd: (entry: WatchEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [binance, setBinance] = useState<string[]>([]);
  const [jupiter, setJupiter] = useState<RawJupiterToken[]>([]);
  const [searching, setSearching] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setBinance([]);
      setJupiter([]);
      setFailures([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setSearching(true);
      setOpen(true);
      setActive(0);

      // allSettled, not all: one venue being down must not blank the other.
      void Promise.allSettled([
        searchBinanceSymbols(needle, PER_VENUE, controller.signal),
        searchJupiterTokens(needle, controller.signal),
      ]).then(([cex, dex]) => {
        if (controller.signal.aborted) return;
        const down: string[] = [];
        setBinance(cex.status === "fulfilled" ? cex.value : []);
        if (cex.status === "rejected") down.push("Binance");
        setJupiter(
          dex.status === "fulfilled" ? dex.value.slice(0, PER_VENUE) : [],
        );
        if (dex.status === "rejected") down.push("Jupiter");
        setFailures(down);
        setSearching(false);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abort.current?.abort(), []);

  // Dismiss on an outside click, so the list does not linger over the grid.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const rows: Result[] = [
      ...binance.map(
        (symbol): Result => ({
          source: "binance",
          id: symbol,
          title: symbol,
          subtitle: "Binance spot",
          meta: "",
        }),
      ),
      ...jupiter.map(
        (token): Result => ({
          source: "jupiter",
          id: token.id,
          title: token.symbol,
          subtitle: token.name,
          meta: token.liquidity ? `$${formatVolume(token.liquidity)}` : "",
          verified: Boolean(token.isVerified),
        }),
      ),
    ];
    return rows.filter(
      (row) => !existingKeys.includes(`${row.source}:${row.id}`),
    );
  }, [binance, jupiter, existingKeys]);

  function choose(row: Result) {
    onAdd({ source: row.source, id: row.id });
    setQuery("");
    setBinance([]);
    setJupiter([]);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active] ?? results[0]);
    }
  }

  const showList = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search markets — BTC, SOL, JUP…"
        aria-label="Search markets on Binance and Jupiter"
        role="combobox"
        aria-expanded={showList}
        aria-controls="market-search-results"
        spellCheck={false}
        autoComplete="off"
        className="num w-60 rounded-md border border-term-border bg-term-bg px-2.5 py-1.5 text-[12px] text-term-text placeholder:text-term-dim placeholder:normal-case focus:border-term-border-hi focus:outline-none"
      />

      {showList && (
        <div
          id="market-search-results"
          role="listbox"
          className="absolute right-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-md border border-term-border-hi bg-term-panel shadow-xl shadow-black/50"
        >
          {results.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-term-dim">
              {searching ? "Searching…" : "No matching market"}
            </p>
          ) : (
            <ul>
              {results.map((row, index) => (
                <li key={`${row.source}:${row.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(row)}
                    className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors ${
                      index === active ? "bg-term-panel-hi" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <VenueBadge source={row.source} />
                      <span className="num truncate text-[12px] font-semibold">
                        {row.title}
                      </span>
                      {/* An unverified look-alike of a major token is the
                          likeliest way to add the wrong thing. */}
                      {row.source === "jupiter" &&
                        (row.verified ? (
                          <span
                            title="Verified by Jupiter"
                            className="shrink-0 text-[10px] text-term-up"
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            title="Not verified by Jupiter — check the mint carefully"
                            className="shrink-0 text-[10px] text-term-down"
                          >
                            !
                          </span>
                        ))}
                      <span className="truncate text-[10px] text-term-dim">
                        {row.subtitle}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[10px] text-term-muted">
                      {row.meta}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {failures.length > 0 && (
            <p
              role="alert"
              className="border-t border-term-border px-2.5 py-1.5 text-[10px] text-term-down"
            >
              {failures.join(" and ")} unreachable — results may be incomplete.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
