"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartResizeHandle } from "@/components/ChartResizeHandle";
import { ChartResizePreview } from "@/components/ChartResizePreview";
import { ChartSizeControl } from "@/components/ChartSizeControl";
import { Header } from "@/components/Header";
import { IntervalPicker } from "@/components/IntervalPicker";
import { PriceChart } from "@/components/PriceChart";
import { VenueBadge } from "@/components/VenueBadge";
import { QuotePanel } from "@/components/QuotePanel";
import { SymbolManager } from "@/components/SymbolManager";
import { WatchlistGrid } from "@/components/WatchlistGrid";
import { useMarketData } from "@/lib/hooks/useMarketData";
import { useChartSpan } from "@/lib/hooks/useChartSpan";
import { useGridFlip } from "@/lib/hooks/useGridFlip";
import { useWatchlist } from "@/lib/hooks/useWatchlist";
import { formatPercent, formatPrice } from "@/lib/format";
import { entryKey, type WatchEntry } from "@/lib/watchlist";
import type { Interval } from "@/lib/binance/types";

/**
 * One grid holds the chart and every tile, so the watchlist can flow *around*
 * the chart rather than sitting in a column beside it.
 *
 * Column counts are fixed per breakpoint rather than `auto-fill`, because the
 * chart is placed relative to the last column line — which requires knowing how
 * many columns there are. Every cell is square, so a chart spanning N columns
 * and N rows is square for free.
 *
 * `dense` is what does the wrapping: tiles pack into the earliest free cells, so
 * they fill the columns to the chart's left and then continue full-width beneath
 * it.
 */
const GRID =
  "grid grid-flow-row-dense gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8";

export default function Dashboard() {
  const { entries, add, remove, reorder } = useWatchlist();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [chartInterval, setChartInterval] = useState<Interval>("15m");

  // The drag measures against the grid's edges and one cell's size, so it needs
  // both elements. Registered via callback refs rather than looked up by
  // selector, which would couple the hook to the markup.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cellRef = useRef<HTMLElement | null>(null);

  // Declared before useChartSpan so the span change can capture positions first;
  // the animation then plays from the old layout to the new one.
  const chartSpanRef = useRef<number>(0);
  const flip = useGridFlip(gridRef, chartSpanRef.current);
  const chartSpan = useChartSpan(undefined, flip.capture);
  chartSpanRef.current = chartSpan.span;

  const registerCell = useCallback(
    (element: HTMLElement | null) => {
      cellRef.current = element;
      chartSpan.setGeometry({ grid: gridRef.current, cell: element });
    },
    [chartSpan],
  );

  const keys = useMemo(() => (entries ?? []).map(entryKey), [entries]);
  const selected: WatchEntry | null = useMemo(
    () => (entries ?? []).find((e) => entryKey(e) === selectedKey) ?? null,
    [entries, selectedKey],
  );

  // Default the chart to the first entry, and follow along if the selected one
  // is removed.
  useEffect(() => {
    if (keys.length === 0) return;
    setSelectedKey((current) =>
      current && keys.includes(current) ? current : keys[0],
    );
  }, [keys]);

  const {
    tickers,
    sparklines,
    meta,
    venueStatus,
    venueLastOk,
    lastTickAt,
    history,
    liveCandle,
    chartLoading,
    error,
  } = useMarketData({ entries, selected, interval: chartInterval });

  const selectedTicker = selectedKey ? tickers.get(selectedKey) : undefined;
  const selectedMeta = selectedKey ? meta.get(selectedKey) : undefined;
  const decimals = selectedMeta?.priceDecimals ?? 2;

  const headline = useMemo(() => {
    if (!selectedTicker) return null;
    const up = selectedTicker.changePct >= 0;
    return {
      pair: selectedMeta
        ? `${selectedMeta.baseAsset}/${selectedMeta.quoteAsset}`
        : (selected?.id ?? ""),
      last: formatPrice(selectedTicker.last, decimals),
      pct: formatPercent(selectedTicker.changePct),
      high: formatPrice(selectedTicker.high24h, decimals),
      low: formatPrice(selectedTicker.low24h, decimals),
      up,
    };
  }, [selectedTicker, selectedMeta, selected, decimals]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        venueStatus={venueStatus}
        venueLastOk={venueLastOk}
        lastTickAt={lastTickAt}
      />

      {error && (
        <p
          role="alert"
          className="border-b border-term-down/30 bg-term-down/10 px-4 py-2 text-[12px] text-term-down"
        >
          {error} — retrying automatically.
        </p>
      )}

      <main className="flex flex-1 flex-col gap-3 p-4">
        {/* Toolbar sits outside the grid: inside it, it would become a cell and
            get shuffled in among the tiles. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-term-muted">
              Watchlist
            </h2>
            <ChartSizeControl
              span={chartSpan.span}
              min={chartSpan.min}
              max={chartSpan.max}
              canGrow={chartSpan.canGrow}
              canShrink={chartSpan.canShrink}
              onGrow={chartSpan.grow}
              onShrink={chartSpan.shrink}
            />
          </div>
          <SymbolManager existingKeys={keys} onAdd={add} />
        </div>

        {/*
          The span reaches CSS as a custom property because inline styles cannot
          be media-queried: at the narrowest breakpoint the chart takes the full
          width regardless, and only the stylesheet knows which case applies.
        */}
        <div
          ref={(element) => {
            gridRef.current = element;
            chartSpan.setGeometry({ grid: element, cell: cellRef.current });
          }}
          style={{ "--chart-span": String(chartSpan.span) } as React.CSSProperties}
          className={`${GRID} relative`}
        >
          {/* Outside the chart section on purpose: the section clips its
              overflow, which would cut the outline off exactly as it grows. */}
          {chartSpan.preview && (
            <ChartResizePreview
              size={chartSpan.preview.size}
              span={chartSpan.preview.span}
            />
          )}
        {/*
          Anchored to the last column line, so it always sits top-right whatever
          the column count. `aspect-square` is the actual guarantee of squareness:
          the row span reserves the cells, but a row with no tiles in it would
          otherwise be free to collapse.
        */}
        <section className="relative col-span-2 row-span-2 flex aspect-square flex-col overflow-hidden rounded-lg border border-term-border bg-term-panel sm:[grid-column:span_var(--chart-span)/-1] sm:[grid-row:1/span_var(--chart-span)]">
          <ChartResizeHandle
            span={chartSpan.span}
            min={chartSpan.min}
            max={chartSpan.max}
            dragging={chartSpan.dragging}
            handlers={chartSpan.handlers}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-border px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
                {headline?.pair ?? selected?.id ?? "—"}
                {selected && <VenueBadge source={selected.source} />}
              </h2>
              {headline && (
                <>
                  <span className="num text-[15px] font-semibold">
                    {headline.last}
                  </span>
                  <span
                    className={`num text-[12px] font-medium ${
                      headline.up ? "text-term-up" : "text-term-down"
                    }`}
                  >
                    {headline.pct}
                  </span>
                  <span className="num text-[11px] text-term-dim">
                    H {headline.high} · L {headline.low}
                  </span>
                </>
              )}
            </div>
            <IntervalPicker value={chartInterval} onChange={setChartInterval} />
          </div>

          <div className="min-h-0 flex-1 p-2">
            <PriceChart
              // Remounting per entry+interval keeps the chart from ever showing
              // one pair's candles under another pair's label.
              key={`${selectedKey}-${chartInterval}`}
              history={history}
              liveCandle={liveCandle}
              priceDecimals={decimals}
              loading={chartLoading}
            />
          </div>

          {/* Quotes exist only on the Jupiter side; a Binance pair has no route.
              Held back until the token's on-chain decimals are known, since
              quoting with the wrong scale is worse than showing nothing. */}
          {selected?.source === "jupiter" &&
            Number.isFinite(selectedMeta?.tokenDecimals) && (
              <QuotePanel
                mint={selected.id}
                meta={selectedMeta}
                tokenDecimals={selectedMeta!.tokenDecimals!}
              />
            )}
        </section>

          {entries === null ? (
            <p className="col-span-full px-1 py-8 text-center text-[12px] text-term-dim">
              Loading watchlist…
            </p>
          ) : (
            <WatchlistGrid
              entries={entries}
              tickers={tickers}
              sparklines={sparklines}
              meta={meta}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onRemove={remove}
              onReorder={reorder}
              firstTileRef={registerCell}
            />
          )}
        </div>

        <p className="text-[11px] text-term-dim">
          Rolling 24-hour window for both venues. Binance tiles stream live; Jup
          tiles poll every 5s, which is as fast as Jupiter&apos;s API allows.
        </p>
      </main>
    </div>
  );
}
