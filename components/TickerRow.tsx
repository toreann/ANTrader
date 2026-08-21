"use client";

import { memo } from "react";
import { HIDE_UNTIL_MD, HIDE_UNTIL_SM } from "@/components/columns";
import { DragHandle } from "@/components/DragHandle";
import { Sparkline } from "@/components/Sparkline";
import { usePriceFlash } from "@/lib/hooks/usePriceFlash";
import {
  formatChange,
  formatPercent,
  formatPrice,
  formatVolume,
} from "@/lib/format";
import type { SymbolMeta, Ticker } from "@/lib/binance/types";

interface TickerRowProps {
  ticker: Ticker;
  meta: SymbolMeta | undefined;
  /** 24h closing prices for the trend line; undefined while still loading. */
  closes: number[] | undefined;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  removable: boolean;
  reorder: RowReorderProps;
}

/** The slice of the reorder API one row needs. */
export interface RowReorderProps {
  index: number;
  offset: number;
  dragging: boolean;
  /** True while any row is being dragged, not just this one. */
  dragActive: boolean;
  onHandlePointerDown: (event: React.PointerEvent) => void;
  onHandlePointerMove: (event: React.PointerEvent) => void;
  onHandlePointerUp: (event: React.PointerEvent) => void;
  onHandleKeyDown: (event: React.KeyboardEvent) => void;
  /** Mouse-only drag from the row body; returns true if it started a press. */
  onBodyPointerDown: (event: React.PointerEvent) => void;
  onBodyPointerMove: (event: React.PointerEvent) => void;
  onBodyPointerUp: (event: React.PointerEvent) => void;
  /** True when the click that just fired was the tail of a drag. */
  shouldIgnoreClick: () => boolean;
}

function TickerRowImpl({
  ticker,
  meta,
  closes,
  selected,
  onSelect,
  onRemove,
  removable,
  reorder,
}: TickerRowProps) {
  // Price precision comes from the exchange's tickSize; 2 is only the fallback
  // for the brief window before exchangeInfo resolves.
  const decimals = meta?.priceDecimals ?? 2;
  const pair = meta ? `${meta.baseAsset}/${meta.quoteAsset}` : ticker.symbol;

  const priceRef = usePriceFlash<HTMLSpanElement>(ticker.last);

  const up = ticker.changePct > 0;
  const down = ticker.changePct < 0;
  const changeColor = up
    ? "text-term-up"
    : down
      ? "text-term-down"
      : "text-term-muted";

  return (
    <tr
      onClick={() => {
        if (reorder.shouldIgnoreClick()) return;
        onSelect(ticker.symbol);
      }}
      onPointerDown={reorder.onBodyPointerDown}
      onPointerMove={reorder.onBodyPointerMove}
      onPointerUp={reorder.onBodyPointerUp}
      onPointerCancel={reorder.onBodyPointerUp}
      aria-selected={selected}
      style={{
        transform: reorder.offset ? `translateY(${reorder.offset}px)` : undefined,
        // The dragged row follows the pointer directly; the rows opening a gap
        // for it animate, which is what makes the target position readable.
        transition: reorder.dragging ? "none" : "transform 160ms ease-out",
        position: reorder.dragging ? "relative" : undefined,
        zIndex: reorder.dragging ? 10 : undefined,
      }}
      className={`cursor-pointer border-b border-term-border/60 last:border-b-0 ${
        reorder.dragging
          ? "bg-term-panel-hi shadow-lg shadow-black/40 [&>td]:!border-term-border-hi"
          : selected
            ? "bg-term-panel-hi"
            : "hover:bg-term-panel-hi/60"
      } ${reorder.dragActive ? "select-none" : ""}`}
    >
      <td className="py-2.5 pl-2 pr-3">
        <div className="flex items-center gap-1.5">
          <DragHandle
            label={pair}
            dragging={reorder.dragging}
            onPointerDown={reorder.onHandlePointerDown}
            onPointerMove={reorder.onHandlePointerMove}
            onPointerUp={reorder.onHandlePointerUp}
            onKeyDown={reorder.onHandleKeyDown}
          />
          <span
            aria-hidden
            className={`h-4 w-0.5 rounded-full ${
              selected ? "bg-term-accent" : "bg-transparent"
            }`}
          />
          <span className="text-[13px] font-semibold tracking-tight">
            {pair}
          </span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-right">
        <span
          ref={priceRef}
          // The price itself stays neutral: the transient flash carries tick
          // direction and the % badge carries the 24h direction. Colouring the
          // price by tick as well produced a red price beside a green percent,
          // which reads as a contradiction rather than as two facts.
          className="num inline-block rounded px-1 text-[13px] font-semibold"
        >
          {formatPrice(ticker.last, decimals)}
        </span>
      </td>

      <td
        className={`num ${HIDE_UNTIL_MD} px-3 py-2.5 text-right text-[12px] ${changeColor}`}
      >
        {formatChange(ticker.change, decimals)}
      </td>

      <td className="px-3 py-2.5 text-right">
        <span
          className={`num rounded px-1.5 py-0.5 text-[12px] font-medium ${changeColor} ${
            up ? "bg-term-up/10" : down ? "bg-term-down/10" : ""
          }`}
        >
          {formatPercent(ticker.changePct)}
        </span>
      </td>

      <td className="num px-3 py-2.5 text-right text-[12px] text-term-muted">
        {formatPrice(ticker.high24h, decimals)}
      </td>

      <td className="num px-3 py-2.5 text-right text-[12px] text-term-muted">
        {formatPrice(ticker.low24h, decimals)}
      </td>

      <td className={`${HIDE_UNTIL_SM} px-3 py-2.5`}>
        <Sparkline
          closes={closes}
          live={ticker.last}
          positive={ticker.changePct >= 0}
          label={`${pair} 24h trend, ${formatPercent(ticker.changePct)}`}
        />
      </td>


      <td
        className={`num ${HIDE_UNTIL_MD} px-3 py-2.5 text-right text-[12px] text-term-muted`}
      >
        {formatVolume(ticker.quoteVolume)}
      </td>

      <td className="py-2.5 pl-1 pr-3 text-right">
        <button
          type="button"
          disabled={!removable}
          onClick={(event) => {
            // Removing must not also select the row being removed.
            event.stopPropagation();
            onRemove(ticker.symbol);
          }}
          aria-label={`Remove ${pair} from the watchlist`}
          // Always rendered, just dim. A hover-only control is invisible to
          // keyboard and screen-reader users, and leaves everyone else guessing
          // how to remove a pair at all.
          className="rounded px-1.5 text-term-dim transition-colors hover:bg-term-border hover:text-term-text disabled:cursor-not-allowed disabled:text-transparent"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

/**
 * Memoized: with a ten-pair watchlist, a tick on one symbol should repaint one
 * row, not all ten.
 */
export const TickerRow = memo(TickerRowImpl);
