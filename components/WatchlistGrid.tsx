"use client";

import { AssetTile } from "@/components/AssetTile";
import { useReorder } from "@/lib/hooks/useReorder";
import { entryKey, type WatchEntry } from "@/lib/watchlist";
import type { SymbolMeta, Ticker } from "@/lib/binance/types";

interface WatchlistGridProps {
  entries: WatchEntry[];
  tickers: Map<string, Ticker>;
  sparklines: Map<string, number[]>;
  meta: Map<string, SymbolMeta>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onReorder: (from: number, to: number) => void;
  /**
   * Receives the first tile, so the chart's resize drag can read one cell's
   * size. Taken from a real tile rather than computed from the grid, because the
   * tile is the thing whose square shape defines the cell.
   */
  firstTileRef?: (element: HTMLElement | null) => void;
}

/**
 * The watchlist tiles.
 *
 * `display: contents` on the wrapper is load-bearing: the tiles must be direct
 * grid items of the *page* grid so they flow around the chart, which occupies an
 * N x N block of the same grid. A wrapper that formed its own box would put the
 * whole watchlist beside the chart instead of around it.
 *
 * Reordering still works through this, because `useReorder` reads geometry from
 * `container.children` — and `display: contents` removes the wrapper's box, not
 * its children.
 *
 * Everything is keyed by `entryKey` (`binance:BTCUSDT`, `jupiter:<mint>`) so a
 * Binance pair and a Solana token that share a ticker symbol cannot collide.
 */
export function WatchlistGrid({
  entries,
  tickers,
  sparklines,
  meta,
  selectedKey,
  onSelect,
  onRemove,
  onReorder,
  firstTileRef,
}: WatchlistGridProps) {
  const reorder = useReorder(entries.length, onReorder);

  return (
    <div ref={reorder.setContainer} style={{ display: "contents" }}>
      {entries.map((entry, index) => {
        const key = entryKey(entry);
        const ticker = tickers.get(key);
        if (!ticker) {
          // Waiting on the first read for a freshly added entry. Rendered as a
          // tile so `children[i]` still maps to entry `i` for drag geometry.
          return (
            <div
              key={key}
              className="flex aspect-square flex-col justify-center border border-term-border bg-term-panel p-2.5 text-center"
            >
              <span className="num truncate text-[11px] font-semibold">
                {entry.source === "jupiter"
                  ? `${entry.id.slice(0, 4)}…${entry.id.slice(-4)}`
                  : entry.id}
              </span>
              <span className="mt-1 text-[10px] text-term-dim">loading…</span>
            </div>
          );
        }
        return (
          <AssetTile
            key={key}
            outerRef={index === 0 ? firstTileRef : undefined}
            entryKey={key}
            ticker={ticker}
            meta={meta.get(key)}
            closes={sparklines.get(key)}
            selected={selectedKey === key}
            onSelect={onSelect}
            onRemove={onRemove}
            removable={entries.length > 1}
            reorder={reorder.tileProps(index)}
          />
        );
      })}
    </div>
  );
}
