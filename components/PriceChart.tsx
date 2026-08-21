"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/binance/types";

interface PriceChartProps {
  history: Candle[];
  liveCandle: Candle | null;
  priceDecimals: number;
  loading: boolean;
}

const UP = "#26d07c";
const DOWN = "#f6465d";
const GRID = "#161d27";
const AXIS_TEXT = "#79839a";

export function PriceChart({
  history,
  liveCandle,
  priceDecimals,
  loading,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Create the chart exactly once. `createChart` touches the DOM, so it can
  // only run in an effect, never during render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      // autoSize wires up a ResizeObserver internally, so the chart tracks its
      // flex parent without us maintaining a second observer.
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: AXIS_TEXT,
        fontSize: 11,
        fontFamily:
          'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, monospace',
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: { borderColor: GRID },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#2a3340", width: 1, labelBackgroundColor: "#2a3340" },
        horzLine: { color: "#2a3340", labelBackgroundColor: "#2a3340" },
      },
    });

    // v5 renamed the series API: addSeries(Definition) replaced v4's
    // addCandlestickSeries().
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastTimeRef.current = null;
    };
  }, []);

  // Keep the price axis at the same precision as the table.
  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: {
        type: "price",
        precision: priceDecimals,
        minMove: 10 ** -priceDecimals,
      },
    });
  }, [priceDecimals]);

  // Full history replaces the dataset — only when the symbol or interval changes.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || history.length === 0) return;
    series.setData(
      history.map((candle) => ({
        ...candle,
        time: candle.time as UTCTimestamp,
      })),
    );
    lastTimeRef.current = history[history.length - 1].time;
    chartRef.current?.timeScale().fitContent();
  }, [history]);

  // Live ticks patch a single candle. Calling setData() on every tick would
  // rebuild the whole series and throw away the user's pan/zoom.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !liveCandle) return;
    const lastTime = lastTimeRef.current;
    // Guard against a stale message arriving before the new history loads,
    // which would push a candle from the previous interval onto the series.
    if (lastTime !== null && liveCandle.time < lastTime) return;
    series.update({ ...liveCandle, time: liveCandle.time as UTCTimestamp });
    lastTimeRef.current = liveCandle.time;
  }, [liveCandle]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-term-panel/70 text-[11px] uppercase tracking-[0.14em] text-term-muted">
          Loading candles…
        </div>
      )}
    </div>
  );
}
