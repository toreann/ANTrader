"use client";

import { AssetTile } from "@/components/AssetTile";
import { useReorder } from "@/lib/hooks/useReorder";
import type { SymbolMeta, Ticker } from "@/lib/binance/types";

interface WatchlistGridProps {
  symbols: string[];
  tickers: Map<string, Ticker>;
  sparklines: Map<string, number[]>;
  meta: Map<string, SymbolMeta>;
  selected: string | null;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onReorder: (from: number, to: number) => void;
}

/**
 * The watchlist as a grid of square tiles.
 *
 * One presentation for every screen size, which is why there is a single
 * `useReorder` instance here. The previous table-plus-cards arrangement mounted
 * both and switched them with CSS, so it needed one instance per presentation —
 * the hidden one having zero-height rects and therefore useless geometry.
 *
 * `auto-fill` with a minimum tile width lets the column count follow the panel
 * rather than a breakpoint, so the same grid works in the narrow desktop column
 * and full-width on a phone.
 */
export function WatchlistGrid({
  symbols,
  tickers,
  sparklines,
  meta,
  selected,
  onSelect,
  onRemove,
  onReorder,
}: WatchlistGridProps) {
  const reorder = useReorder(symbols.length, onReorder);

  return (
    <div
      ref={reorder.setContainer}
      // -mt-px/-ml-px with collapsed tile borders would double up; instead the
      // gap is a real gap so each square reads as its own cell in the grid.
      className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 p-2"
    >
      {symbols.map((symbol, index) => {
        const ticker = tickers.get(symbol);
        if (!ticker) {
          // Waiting on the first snapshot for a freshly added pair. Rendered as
          // a tile so `children[i]` still maps to entry `i` for drag geometry.
          return (
            <div
              key={symbol}
              className="flex aspect-square flex-col justify-center border border-term-border bg-term-panel p-2.5 text-center"
            >
              <span className="num truncate text-[11px] font-semibold">
                {symbol}
              </span>
              <span className="mt-1 text-[10px] text-term-dim">loading…</span>
            </div>
          );
        }
        return (
          <AssetTile
            key={symbol}
            ticker={ticker}
            meta={meta.get(symbol)}
            closes={sparklines.get(symbol)}
            selected={selected === symbol}
            onSelect={onSelect}
            onRemove={onRemove}
            removable={symbols.length > 1}
            reorder={reorder.tileProps(index)}
          />
        );
      })}
    </div>
  );
}
