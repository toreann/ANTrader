"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { IntervalPicker } from "@/components/IntervalPicker";
import { PriceChart } from "@/components/PriceChart";
import { SymbolManager } from "@/components/SymbolManager";
import { WatchlistTable } from "@/components/WatchlistTable";
import { useMarketData } from "@/lib/hooks/useMarketData";
import { useWatchlist } from "@/lib/hooks/useWatchlist";
import { formatPercent, formatPrice } from "@/lib/format";
import type { Interval } from "@/lib/binance/types";

/**
 * Side by side at xl, the two panels share one definite height so the dashboard
 * reads as a single instrument rather than two mismatched cards.
 *
 * Stacked below xl they behave differently on purpose. The watchlist sizes to
 * its rows — pinning it left a screenful of dead space to scroll past before
 * reaching the chart. The chart, by contrast, always needs a real height: it
 * measures its own container, and `h-full` cannot resolve against a min-height
 * chain, which silently collapsed the canvas to just its time axis.
 */
const WATCHLIST_HEIGHT =
  // max-h must be released at xl, or it keeps capping the matched height.
  "max-h-[70dvh] xl:max-h-none xl:h-[calc(100dvh-8.5rem)]";
const CHART_HEIGHT = "h-[26rem] xl:h-[calc(100dvh-8.5rem)]";

export default function Dashboard() {
  const { symbols, add, remove, reorder } = useWatchlist();
  const [selected, setSelected] = useState<string | null>(null);
  const [chartInterval, setChartInterval] = useState<Interval>("15m");

  // Default the chart to the first watchlist pair, and follow along if the
  // selected pair is removed.
  useEffect(() => {
    if (!symbols || symbols.length === 0) return;
    setSelected((current) =>
      current && symbols.includes(current) ? current : symbols[0],
    );
  }, [symbols]);

  const {
    tickers,
    sparklines,
    meta,
    status,
    lastTickAt,
    history,
    liveCandle,
    chartLoading,
    error,
  } = useMarketData({ symbols, chartSymbol: selected, interval: chartInterval });

  const selectedTicker = selected ? tickers.get(selected) : undefined;
  const selectedMeta = selected ? meta.get(selected) : undefined;
  const decimals = selectedMeta?.priceDecimals ?? 2;

  const headline = useMemo(() => {
    if (!selectedTicker) return null;
    const up = selectedTicker.changePct >= 0;
    return {
      pair: selectedMeta
        ? `${selectedMeta.baseAsset}/${selectedMeta.quoteAsset}`
        : (selected ?? ""),
      last: formatPrice(selectedTicker.last, decimals),
      pct: formatPercent(selectedTicker.changePct),
      high: formatPrice(selectedTicker.high24h, decimals),
      low: formatPrice(selectedTicker.low24h, decimals),
      up,
    };
  }, [selectedTicker, selectedMeta, selected, decimals]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header status={status} lastTickAt={lastTickAt} />

      {error && (
        <p
          role="alert"
          className="border-b border-term-down/30 bg-term-down/10 px-4 py-2 text-[12px] text-term-down"
        >
          {error} — retrying automatically.
        </p>
      )}

      <main className="flex flex-1 flex-col gap-4 p-4 xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        {/* Watchlist */}
        <section className={`${WATCHLIST_HEIGHT} flex flex-col overflow-hidden rounded-lg border border-term-border bg-term-panel`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-border px-4 py-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-term-muted">
              Watchlist
            </h2>
            <SymbolManager existing={symbols ?? []} onAdd={add} />
          </div>

          {/* The table scrolls inside the panel so the panel keeps its height
              however many pairs are being watched. */}
          <div className="min-h-0 flex-1 overflow-auto">
            {symbols === null ? (
              <p className="px-4 py-8 text-center text-[12px] text-term-dim">
                Loading watchlist…
              </p>
            ) : (
              <WatchlistTable
                symbols={symbols}
                tickers={tickers}
                sparklines={sparklines}
                meta={meta}
                selected={selected}
                onSelect={setSelected}
                onRemove={remove}
                onReorder={reorder}
              />
            )}
          </div>

          <p className="border-t border-term-border px-4 py-2 text-[11px] text-term-dim">
            High, low and range cover a rolling 24-hour window — the same basis
            exchanges quote.
          </p>
        </section>

        {/* Chart */}
        <section className={`${CHART_HEIGHT} flex flex-col overflow-hidden rounded-lg border border-term-border bg-term-panel`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-border px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[13px] font-semibold tracking-tight">
                {headline?.pair ?? selected ?? "—"}
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
              // Remounting per symbol+interval keeps the chart from ever
              // showing one pair's candles under another pair's label.
              key={`${selected}-${chartInterval}`}
              history={history}
              liveCandle={liveCandle}
              priceDecimals={decimals}
              loading={chartLoading}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
