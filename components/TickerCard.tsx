"use client";

import { memo } from "react";
import { RangeBar } from "@/components/RangeBar";
import { Sparkline } from "@/components/Sparkline";
import { DragHandle } from "@/components/DragHandle";
import type { RowReorderProps } from "@/components/TickerRow";
import { usePriceFlash } from "@/lib/hooks/usePriceFlash";
import { formatPercent, formatPrice } from "@/lib/format";
import type { SymbolMeta, Ticker } from "@/lib/binance/types";

interface TickerCardProps {
  ticker: Ticker;
  meta: SymbolMeta | undefined;
  closes: number[] | undefined;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  removable: boolean;
  reorder: RowReorderProps;
}

/**
 * The narrow-screen presentation of a watchlist entry.
 *
 * A phone cannot hold five numeric columns — the table needed 517px of content
 * in 341px of space, which pushed the day's high and low behind a horizontal
 * scroll. Since those two numbers are the point of the dashboard, narrow screens
 * get a stacked card instead of a squeezed row.
 */
function TickerCardImpl({
  ticker,
  meta,
  closes,
  selected,
  onSelect,
  onRemove,
  removable,
  reorder,
}: TickerCardProps) {
  const priceRef = usePriceFlash<HTMLSpanElement>(ticker.last);
  const decimals = meta?.priceDecimals ?? 2;
  const pair = meta ? `${meta.baseAsset}/${meta.quoteAsset}` : ticker.symbol;

  const up = ticker.changePct > 0;
  const down = ticker.changePct < 0;
  const changeColor = up
    ? "text-term-up"
    : down
      ? "text-term-down"
      : "text-term-muted";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => {
        if (reorder.shouldIgnoreClick()) return;
        onSelect(ticker.symbol);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(ticker.symbol);
        }
      }}
      style={{
        transform: reorder.offset ? `translateY(${reorder.offset}px)` : undefined,
        transition: reorder.dragging ? "none" : "transform 160ms ease-out",
        position: "relative",
        zIndex: reorder.dragging ? 10 : undefined,
      }}
      className={`w-full border-b border-term-border/60 px-4 py-3 text-left last:border-b-0 ${
        reorder.dragging
          ? "bg-term-panel-hi shadow-lg shadow-black/40"
          : selected
            ? "bg-term-panel-hi"
            : ""
      } ${reorder.dragActive ? "select-none" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3">
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
            className={`h-3.5 w-0.5 rounded-full ${
              selected ? "bg-term-accent" : "bg-transparent"
            }`}
          />
          <span className="text-[13px] font-semibold tracking-tight">
            {pair}
          </span>
        </div>
        <span
          ref={priceRef}
          className="num rounded px-1 text-[15px] font-semibold"
        >
          {formatPrice(ticker.last, decimals)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span
          className={`num rounded px-1.5 py-0.5 text-[11px] font-medium ${changeColor} ${
            up ? "bg-term-up/10" : down ? "bg-term-down/10" : ""
          }`}
        >
          {formatPercent(ticker.changePct)}
        </span>
        <span className="num text-[11px] text-term-muted">
          H {formatPrice(ticker.high24h, decimals)} · L{" "}
          {formatPrice(ticker.low24h, decimals)}
        </span>
      </div>

      <div className="mt-2">
        <Sparkline
          closes={closes}
          live={ticker.last}
          positive={ticker.changePct >= 0}
          label={`${pair} 24h trend, ${formatPercent(ticker.changePct)}`}
        />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <RangeBar last={ticker.last} low={ticker.low24h} high={ticker.high24h} />
        <button
          type="button"
          disabled={!removable}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(ticker.symbol);
          }}
          aria-label={`Remove ${pair} from the watchlist`}
          className="shrink-0 rounded px-1.5 text-term-dim transition-colors hover:bg-term-border hover:text-term-text disabled:cursor-not-allowed disabled:text-transparent"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export const TickerCard = memo(TickerCardImpl);
