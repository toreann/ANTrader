"use client";

import { memo } from "react";
import { DragHandle } from "@/components/DragHandle";
import { Sparkline } from "@/components/Sparkline";
import { usePriceFlash } from "@/lib/hooks/usePriceFlash";
import { formatPercent, formatPrice } from "@/lib/format";
import type { TileReorderProps } from "@/lib/hooks/useReorder";
import type { SymbolMeta, Ticker } from "@/lib/binance/types";

interface AssetTileProps {
  ticker: Ticker;
  meta: SymbolMeta | undefined;
  /** 24h closing prices for the trend line; undefined while still loading. */
  closes: number[] | undefined;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  removable: boolean;
  reorder: TileReorderProps;
}

/**
 * One asset as a square tile.
 *
 * Strictly 1:1 via `aspect-square`. Content is distributed top-to-bottom with
 * the sparkline as the flex-grow element, so the square neither leaves a hole at
 * large sizes nor crushes its own text at small ones — the trend line simply
 * takes whatever height is left over.
 */
function AssetTileImpl({
  ticker,
  meta,
  closes,
  selected,
  onSelect,
  onRemove,
  removable,
  reorder,
}: AssetTileProps) {
  const priceRef = usePriceFlash<HTMLSpanElement>(ticker.last);
  // Price precision comes from the exchange's tickSize; 2 is only the fallback
  // for the brief window before exchangeInfo resolves.
  const decimals = meta?.priceDecimals ?? 2;
  const pair = meta ? `${meta.baseAsset}/${meta.quoteAsset}` : ticker.symbol;

  const up = ticker.changePct > 0;
  const down = ticker.changePct < 0;
  const changeColor = up
    ? "text-term-up"
    : down
      ? "text-term-down"
      : "text-term-muted";

  const { offset, dragging, dragActive } = reorder;

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
      onPointerDown={reorder.onBodyPointerDown}
      onPointerMove={reorder.onBodyPointerMove}
      onPointerUp={reorder.onBodyPointerUp}
      onPointerCancel={reorder.onBodyPointerUp}
      style={{
        transform:
          offset.x || offset.y
            ? `translate(${offset.x}px, ${offset.y}px)`
            : undefined,
        // The dragged tile tracks the pointer exactly; the tiles opening a slot
        // for it animate, which is what makes the target position readable.
        transition: dragging ? "none" : "transform 160ms ease-out",
        position: "relative",
        zIndex: dragging ? 20 : undefined,
      }}
      className={`flex aspect-square cursor-pointer flex-col gap-1 border p-2.5 text-left ${
        dragging
          ? "border-term-border-hi bg-term-panel-hi shadow-xl shadow-black/50"
          : selected
            ? "border-term-accent bg-term-panel-hi"
            : "border-term-border bg-term-panel hover:border-term-border-hi hover:bg-term-panel-hi/60"
      } ${dragActive ? "select-none" : ""}`}
    >
      {/* Header: grip, pair, remove */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <DragHandle
            label={pair}
            dragging={dragging}
            onPointerDown={reorder.onHandlePointerDown}
            onPointerMove={reorder.onHandlePointerMove}
            onPointerUp={reorder.onHandlePointerUp}
            onKeyDown={reorder.onHandleKeyDown}
          />
          <span className="truncate text-[11px] font-semibold tracking-tight">
            {pair}
          </span>
        </div>
        <button
          type="button"
          disabled={!removable}
          onClick={(event) => {
            // Removing must not also select the tile being removed.
            event.stopPropagation();
            onRemove(ticker.symbol);
          }}
          aria-label={`Remove ${pair} from the watchlist`}
          className="shrink-0 rounded px-1 text-term-dim transition-colors hover:bg-term-border hover:text-term-text disabled:cursor-not-allowed disabled:text-transparent"
        >
          ×
        </button>
      </div>

      {/* Price and 24h change */}
      <div>
        <span
          ref={priceRef}
          // Neutral by design: the transient flash carries tick direction and
          // the badge below carries the 24h direction. Colouring the price by
          // tick as well produced a red price beside a green percent, which
          // reads as a contradiction rather than as two facts.
          className="num block truncate rounded text-[15px] font-semibold leading-tight"
        >
          {formatPrice(ticker.last, decimals)}
        </span>
        <span
          className={`num mt-0.5 inline-block rounded px-1 py-0.5 text-[10px] font-medium ${changeColor} ${
            up ? "bg-term-up/10" : down ? "bg-term-down/10" : ""
          }`}
        >
          {formatPercent(ticker.changePct)}
        </span>
      </div>

      {/* The trend line absorbs whatever height the square has left. */}
      <div className="min-h-0 flex-1">
        <Sparkline
          closes={closes}
          live={ticker.last}
          positive={ticker.changePct >= 0}
          label={`${pair} 24h trend, ${formatPercent(ticker.changePct)}`}
          fill
        />
      </div>

      {/* Labels are term-muted, not term-dim: at 10px, dim lands near 2.6:1
          against the panel, under the 4.5:1 AA floor. Hierarchy comes from the
          values being brighter than the labels instead. */}
      <dl className="num grid grid-cols-[auto_1fr] gap-x-1.5 text-[10px] leading-tight">
        <dt className="text-term-muted">H</dt>
        <dd className="truncate text-right text-term-text">
          {formatPrice(ticker.high24h, decimals)}
        </dd>
        <dt className="text-term-muted">L</dt>
        <dd className="truncate text-right text-term-text">
          {formatPrice(ticker.low24h, decimals)}
        </dd>
      </dl>
    </div>
  );
}

/**
 * Memoized: with a large watchlist, a tick on one symbol should repaint one
 * tile, not all of them.
 */
export const AssetTile = memo(AssetTileImpl);
