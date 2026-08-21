"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BinanceSocket } from "@/lib/binance/socket";
import {
  fetchKlines,
  fetchSparklines,
  fetchSymbolMeta,
  fetchTickerSnapshot,
} from "@/lib/binance/rest";
import { klineStream, tickerStream } from "@/lib/binance/streams";
import type {
  Candle,
  ConnectionStatus,
  Interval,
  RawKlineEvent,
  RawTickerEvent,
  SymbolMeta,
  Ticker,
} from "@/lib/binance/types";

/**
 * Ticker updates are buffered and applied on this cadence rather than one
 * setState per message.
 *
 * Binance pushes each `@ticker` about once a second, staggered across symbols —
 * so a 10-pair watchlist would otherwise re-render the table ~10 times a second
 * at unpredictable moments. Coalescing on a fixed interval bounds re-renders to
 * a constant regardless of how many pairs are being watched, while staying far
 * below the threshold where the eye notices any delay.
 */
const FLUSH_INTERVAL_MS = 100;

/**
 * How often the per-row trend lines are refetched.
 *
 * Their live tip already comes from the ticker stream, so this only has to keep
 * the 24h window from sliding out of date as candles roll over. Five minutes
 * costs one small request per pair and keeps the line honest; subscribing to a
 * kline stream per pair would push an event every second to learn something
 * that changes every thirty minutes.
 */
const SPARKLINE_REFRESH_MS = 5 * 60 * 1000;

interface MarketDataArgs {
  symbols: string[] | null;
  chartSymbol: string | null;
  interval: Interval;
}

function tickerFromEvent(event: RawTickerEvent): Ticker {
  return {
    symbol: event.s,
    last: Number(event.c),
    open: Number(event.o),
    high24h: Number(event.h),
    low24h: Number(event.l),
    change: Number(event.p),
    changePct: Number(event.P),
    quoteVolume: Number(event.q),
    updatedAt: event.E,
  };
}

function candleFromEvent(event: RawKlineEvent): Candle {
  return {
    time: Math.floor(event.k.t / 1000),
    open: Number(event.k.o),
    high: Number(event.k.h),
    low: Number(event.k.l),
    close: Number(event.k.c),
  };
}

/**
 * Owns the single Binance socket and every piece of live state derived from it.
 *
 * Deliberately one hook rather than separate ticker/kline hooks: the dashboard
 * must use exactly one connection, and a single owner enforces that directly
 * instead of requiring two hooks to share a socket through an event emitter.
 */
export function useMarketData({ symbols, chartSymbol, interval }: MarketDataArgs) {
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [sparklines, setSparklines] = useState<Map<string, number[]>>(new Map());
  const [meta, setMeta] = useState<Map<string, SymbolMeta>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  const [history, setHistory] = useState<Candle[]>([]);
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<BinanceSocket | null>(null);
  const pending = useRef<Map<string, RawTickerEvent>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values the socket callbacks need, without re-creating the socket.
  const symbolsRef = useRef<string[]>([]);
  const chartRef = useRef<{ symbol: string | null; interval: Interval }>({
    symbol: chartSymbol,
    interval,
  });
  chartRef.current = { symbol: chartSymbol, interval };

  const flush = useCallback(() => {
    const batch = pending.current;
    if (batch.size === 0) return;
    pending.current = new Map();
    setTickers((current) => {
      const next = new Map(current);
      for (const [symbol, event] of batch) {
        next.set(symbol, tickerFromEvent(event));
      }
      return next;
    });
    setLastTickAt(Date.now());
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }, [flush]);

  /** Pull a fresh REST snapshot — on first load and after every reconnect. */
  const snapshot = useCallback(async (list: string[]) => {
    if (list.length === 0) return;
    try {
      const rows = await fetchTickerSnapshot(list);
      setTickers((current) => {
        const next = new Map(current);
        for (const row of rows) {
          next.set(row.symbol, row);
        }
        return next;
      });
      setLastTickAt(Date.now());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to reach Binance",
      );
    }
  }, []);

  /** The exact set of streams the dashboard wants carried right now. */
  const desiredStreams = useMemo(() => {
    if (!symbols || symbols.length === 0) return [];
    const streams = symbols.map(tickerStream);
    if (chartSymbol) streams.push(klineStream(chartSymbol, interval));
    return streams;
  }, [symbols, chartSymbol, interval]);

  // Read by the socket-creation effect, which must not re-run when streams change.
  const desiredStreamsRef = useRef<string[]>(desiredStreams);
  desiredStreamsRef.current = desiredStreams;

  useEffect(() => {
    symbolsRef.current = symbols ?? [];
  }, [symbols]);

  // ---- Socket lifecycle: created once, subscriptions reconciled separately ----
  useEffect(() => {
    const socket = new BinanceSocket({
      onTicker: (event) => {
        pending.current.set(event.s, event);
        scheduleFlush();
      },
      onKline: (event) => {
        const current = chartRef.current;
        // Late messages from a stream we just unsubscribed from must not
        // corrupt the chart we have already switched to.
        if (event.s !== current.symbol || event.k.i !== current.interval) return;
        setLiveCandle(candleFromEvent(event));
      },
      onStatus: setStatus,
      onConnected: () => {
        void snapshot(symbolsRef.current);
      },
    });
    socketRef.current = socket;
    // sync() here as well as in the reconcile effect below: whichever runs
    // first wins, and the other becomes a no-op. Neither effect has to know
    // about the other's ordering.
    socket.sync(desiredStreamsRef.current);

    return () => {
      socket.dispose();
      socketRef.current = null;
      if (flushTimer.current !== null) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      pending.current = new Map();
    };
  }, [scheduleFlush, snapshot]);

  // ---- Reconcile the desired stream set whenever inputs change ----
  useEffect(() => {
    socketRef.current?.sync(desiredStreams);
  }, [desiredStreams]);

  // ---- Symbol metadata (price precision), fetched once per new symbol ----
  useEffect(() => {
    if (!symbols || symbols.length === 0) return;
    let cancelled = false;
    fetchSymbolMeta(symbols)
      .then((found) => {
        if (!cancelled) setMeta(found);
      })
      .catch(() => {
        /* Formatting falls back to a sane default when metadata is missing. */
      });
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  // ---- Per-row 24h trend lines ----
  useEffect(() => {
    if (!symbols || symbols.length === 0) return;
    const controller = new AbortController();

    const load = async () => {
      const found = await fetchSparklines(symbols, controller.signal);
      if (controller.signal.aborted) return;
      setSparklines((current) => {
        const next = new Map(current);
        for (const [symbol, closes] of found) next.set(symbol, closes);
        // Drop pairs that are no longer watched, so the map cannot grow forever.
        for (const symbol of next.keys()) {
          if (!symbols.includes(symbol)) next.delete(symbol);
        }
        return next;
      });
    };

    void load();
    const timer = setInterval(() => void load(), SPARKLINE_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [symbols]);

  // ---- Candle history for the selected pair and interval ----
  useEffect(() => {
    if (!chartSymbol) return;
    const controller = new AbortController();
    setChartLoading(true);
    setLiveCandle(null);

    fetchKlines(chartSymbol, interval, 500, controller.signal)
      .then((candles) => {
        setHistory(candles);
        setChartLoading(false);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setChartLoading(false);
        setError(
          cause instanceof Error ? cause.message : "Failed to load candles",
        );
      });

    return () => controller.abort();
  }, [chartSymbol, interval]);

  return {
    tickers,
    sparklines,
    meta,
    status,
    lastTickAt,
    history,
    liveCandle,
    chartLoading,
    error,
  };
}
