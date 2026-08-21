"use client";

import { HIDE_UNTIL_MD, HIDE_UNTIL_SM } from "@/components/columns";
import { useReorder, type ReorderApi } from "@/lib/hooks/useReorder";
import type { RowReorderProps } from "@/components/TickerRow";
import { TickerCard } from "@/components/TickerCard";
import { TickerRow } from "@/components/TickerRow";
import type { SymbolMeta, Ticker } from "@/lib/binance/types";

interface WatchlistTableProps {
  symbols: string[];
  tickers: Map<string, Ticker>;
  sparklines: Map<string, number[]>;
  meta: Map<string, SymbolMeta>;
  selected: string | null;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onReorder: (from: number, to: number) => void;
}

const COLUMNS = [
  { label: "Pair", align: "text-left", hide: "", width: "" },
  { label: "Last", align: "text-right", hide: "", width: "" },
  { label: "24h Δ", align: "text-right", hide: HIDE_UNTIL_MD, width: "" },
  { label: "24h %", align: "text-right", hide: "", width: "" },
  { label: "24h High", align: "text-right", hide: "", width: "" },
  { label: "24h Low", align: "text-right", hide: "", width: "" },
  // w-full on one column of an auto-layout table hands it all the slack the
  // text columns do not need, so the trend line gets the widest cell rather
  // than the leftover space being spread thinly across every column.
  { label: "24h Trend", align: "text-left", hide: HIDE_UNTIL_SM, width: "w-full" },
  { label: "Volume", align: "text-right", hide: HIDE_UNTIL_MD, width: "" },
];

/**
 * Adapts the list-wide reorder API to what a single row needs.
 *
 * The handle stops propagation so a press there is not also handled by the row
 * body, and the body only starts a drag for a mouse: making a touch-drag on the
 * row body work would require `touch-action: none`, which would stop the
 * watchlist from scrolling on a phone.
 */
function rowReorderProps(api: ReorderApi, index: number): RowReorderProps {
  return {
    index,
    offset: api.offsetFor(index),
    dragging: api.draggingIndex === index,
    dragActive: api.draggingIndex !== null,
    onHandlePointerDown: (event) => {
      event.stopPropagation();
      api.onPointerDown(index, event);
    },
    onHandlePointerMove: api.onPointerMove,
    onHandlePointerUp: api.onPointerUp,
    onHandleKeyDown: (event) => api.onKeyDown(index, event),
    onBodyPointerDown: (event) => {
      if (event.pointerType !== "mouse") return;
      api.onPointerDown(index, event);
    },
    onBodyPointerMove: api.onPointerMove,
    onBodyPointerUp: api.onPointerUp,
    shouldIgnoreClick: api.consumeDragged,
  };
}

function Pending({ symbol }: { symbol: string }) {
  return (
    <span className="text-[12px] text-term-dim">
      {symbol} — loading…
    </span>
  );
}

/**
 * The watchlist, in two presentations.
 *
 * Both are rendered and switched with CSS rather than a media-query hook, so the
 * server and client markup always agree and there is no layout flash on load.
 * At five to ten pairs the cost of rendering both is not measurable.
 */
export function WatchlistTable({
  symbols,
  tickers,
  sparklines,
  meta,
  selected,
  onSelect,
  onRemove,
  onReorder,
}: WatchlistTableProps) {
  // One instance per presentation: both are mounted, but the hidden one has
  // zero-height rects, so they cannot share geometry.
  const cardReorder = useReorder(symbols.length, onReorder);
  const tableReorder = useReorder(symbols.length, onReorder);

  return (
    <>
      {/* Narrow screens: stacked cards, so high and low stay on screen. */}
      <div className="sm:hidden" ref={cardReorder.setContainer}>
        {symbols.map((symbol, index) => {
          const ticker = tickers.get(symbol);
          if (!ticker) {
            return (
              <div
                key={symbol}
                className="border-b border-term-border/60 px-4 py-3 last:border-b-0"
              >
                <Pending symbol={symbol} />
              </div>
            );
          }
          return (
            <TickerCard
              key={symbol}
              ticker={ticker}
              meta={meta.get(symbol)}
              closes={sparklines.get(symbol)}
              selected={selected === symbol}
              onSelect={onSelect}
              onRemove={onRemove}
              removable={symbols.length > 1}
              reorder={rowReorderProps(cardReorder, index)}
            />
          );
        })}
      </div>

      {/* Wider screens: the full grid, with optional columns appearing at md. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse md:min-w-[700px]">
          <thead>
            <tr className="border-b border-term-border">
              {COLUMNS.map((column, index) => (
                <th
                  key={column.label}
                  scope="col"
                  className={`${column.align} ${column.hide} ${column.width} whitespace-nowrap py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-term-dim ${
                    index === 0 ? "pl-4 pr-3" : "px-3"
                  }`}
                >
                  {column.label}
                </th>
              ))}
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody ref={tableReorder.setContainer}>
            {symbols.map((symbol, index) => {
              const ticker = tickers.get(symbol);
              if (!ticker) {
                return (
                  <tr
                    key={symbol}
                    className="border-b border-term-border/60 last:border-b-0"
                  >
                    <td
                      colSpan={COLUMNS.length + 1}
                      className="py-2.5 pl-4 pr-3"
                    >
                      <Pending symbol={symbol} />
                    </td>
                  </tr>
                );
              }
              return (
                <TickerRow
                  key={symbol}
                  ticker={ticker}
                  meta={meta.get(symbol)}
                  closes={sparklines.get(symbol)}
                  selected={selected === symbol}
                  onSelect={onSelect}
                  onRemove={onRemove}
                  removable={symbols.length > 1}
                  reorder={rowReorderProps(tableReorder, index)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
