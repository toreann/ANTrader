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
import {
  fetchJupiterChart,
  fetchJupiterMeta,
  fetchJupiterPrices,
  fetchJupiterWindow,
  toJupiterTicker,
} from "@/lib/jupiter/rest";
import { entryKey, type WatchEntry } from "@/lib/watchlist";
import type {
  Candle,
  ConnectionStatus,
  VenueStatus,
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
 * so a 10-pair watchlist would otherwise re-render the grid ~10 times a second
 * at unpredictable moments. Coalescing on a fixed interval bounds re-renders to
 * a constant regardless of how many pairs are watched, while staying far below
 * the threshold where the eye notices any delay.
 */
const FLUSH_INTERVAL_MS = 100;

/** How often the Binance trend lines are refetched. */
const SPARKLINE_REFRESH_MS = 5 * 60 * 1000;

/**
 * How often Jupiter prices are polled.
 *
 * Jupiter has no WebSocket, and `price/v3` answers with
 * `cache-control: max-age=5` — so polling faster returns the same numbers and
 * only burns rate limit. This is the honest ceiling on how live a Solana tile
 * can be, and the UI labels the venue rather than pretending otherwise.
 */
const JUPITER_POLL_MS = 5_000;

/**
 * How often the derived 24h window is recomputed for Solana tokens.
 *
 * Jupiter publishes no extremes at all, so high/low come from a candle series.
 * Between refreshes they are widened by the live price, which is what makes a
 * new high appear immediately rather than up to five minutes late.
 */
const JUPITER_WINDOW_REFRESH_MS = 5 * 60 * 1000;

interface MarketDataArgs {
  entries: WatchEntry[] | null;
  /** The selected entry, whose candles feed the main chart. */
  selected: WatchEntry | null;
  interval: Interval;
}

function tickerFromEvent(event: RawTickerEvent): Ticker {
  return {
    source: "binance",
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
 * Owns every live data path the dashboard has: one Binance socket and one
 * Jupiter poller.
 *
 * Deliberately one hook. The single-connection requirement for Binance is
 * enforced directly by having a single owner, and keying every map by
 * `entryKey` means the two venues coexist without the UI needing to know which
 * is which except to label it.
 */
export function useMarketData({ entries, selected, interval }: MarketDataArgs) {
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [sparklines, setSparklines] = useState<Map<string, number[]>>(new Map());
  const [meta, setMeta] = useState<Map<string, SymbolMeta>>(new Map());
  const [socketStatus, setSocketStatus] =
    useState<ConnectionStatus>("connecting");
  const [jupiterStatus, setJupiterStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);
  // Per-venue "last time this path actually answered", which is what makes a
  // silently stalled feed distinguishable from a quiet market.
  const [binanceOkAt, setBinanceOkAt] = useState<number | null>(null);
  const [jupiterOkAt, setJupiterOkAt] = useState<number | null>(null);

  const [history, setHistory] = useState<Candle[]>([]);
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<BinanceSocket | null>(null);
  const pending = useRef<Map<string, RawTickerEvent>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Split the watchlist by venue, stably ----
  const binanceSymbols = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => e.source === "binance")
        .map((e) => e.id),
    [entries],
  );
  const jupiterMints = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => e.source === "jupiter")
        .map((e) => e.id),
    [entries],
  );
  // Joined keys so effects depend on content rather than array identity.
  const binanceKey = binanceSymbols.join(",");
  const jupiterKey = jupiterMints.join(",");

  const binanceRef = useRef<string[]>([]);
  binanceRef.current = binanceSymbols;

  const chartRef = useRef<{ entry: WatchEntry | null; interval: Interval }>({
    entry: selected,
    interval,
  });
  chartRef.current = { entry: selected, interval };

  // ---- Binance: coalesced socket ingest ----
  const flush = useCallback(() => {
    const batch = pending.current;
    if (batch.size === 0) return;
    pending.current = new Map();
    setTickers((current) => {
      const next = new Map(current);
      for (const [symbol, event] of batch) {
        next.set(`binance:${symbol}`, tickerFromEvent(event));
      }
      return next;
    });
    const now = Date.now();
    setLastTickAt(now);
    setBinanceOkAt(now);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }, [flush]);

  /** REST snapshot — on first load and after every reconnect. */
  const snapshot = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      const rows = await fetchTickerSnapshot(symbols);
      setTickers((current) => {
        const next = new Map(current);
        for (const row of rows) next.set(`binance:${row.symbol}`, row);
        return next;
      });
      setLastTickAt(Date.now());
      setBinanceOkAt(Date.now());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to reach Binance",
      );
    }
  }, []);

  /** The exact set of streams the dashboard wants carried right now. */
  const desiredStreams = useMemo(() => {
    if (binanceSymbols.length === 0) return [];
    const streams = binanceSymbols.map(tickerStream);
    if (selected?.source === "binance") {
      streams.push(klineStream(selected.id, interval));
    }
    return streams;
  }, [binanceSymbols, selected, interval]);

  const desiredStreamsRef = useRef<string[]>(desiredStreams);
  desiredStreamsRef.current = desiredStreams;

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
        if (current.entry?.source !== "binance") return;
        if (event.s !== current.entry.id || event.k.i !== current.interval) {
          return;
        }
        setLiveCandle(candleFromEvent(event));
      },
      onStatus: setSocketStatus,
      onConnected: () => {
        void snapshot(binanceRef.current);
      },
    });
    socketRef.current = socket;
    // sync() here as well as in the reconcile effect below: whichever runs
    // first wins, and the other becomes a no-op.
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

  useEffect(() => {
    socketRef.current?.sync(desiredStreams);
  }, [desiredStreams]);



  // ---- Jupiter: price polling ----
  useEffect(() => {
    if (jupiterMints.length === 0) return;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const prices = await fetchJupiterPrices(jupiterMints, controller.signal);
        if (controller.signal.aborted) return;
        setTickers((current) => {
          const next = new Map(current);
          for (const [mint, price] of prices) {
            const key = `jupiter:${mint}`;
            const previous = next.get(key);
            // Reuse the extremes already derived from candles; the constructor
            // widens them with the new live price.
            const window = previous
              ? { high24h: previous.high24h, low24h: previous.low24h, closes: [] }
              : null;
            next.set(key, toJupiterTicker(mint, price, window));
          }
          return next;
        });
        const now = Date.now();
        setLastTickAt(now);
        setJupiterOkAt(now);
        setJupiterStatus("live");
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        // The interval keeps running, so this is a retry state rather than a
        // terminal one — same semantics as the socket reconnecting.
        setJupiterStatus("reconnecting");
        setError(
          cause instanceof Error ? cause.message : "Failed to reach Jupiter",
        );
      }
    };

    setJupiterStatus((current) => (current === "live" ? current : "connecting"));
    void poll();
    const timer = setInterval(() => void poll(), JUPITER_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jupiterKey]);

  // ---- Jupiter: derived 24h window, which also supplies the trend line ----
  useEffect(() => {
    if (jupiterMints.length === 0) return;
    const controller = new AbortController();

    const load = async () => {
      const results = await Promise.allSettled(
        jupiterMints.map(async (mint) => ({
          mint,
          window: await fetchJupiterWindow(mint, controller.signal),
        })),
      );
      if (controller.signal.aborted) return;

      setTickers((current) => {
        const next = new Map(current);
        for (const result of results) {
          if (result.status !== "fulfilled" || !result.value.window) continue;
          const key = `jupiter:${result.value.mint}`;
          const existing = next.get(key);
          if (!existing) continue;
          const { high24h, low24h } = result.value.window;
          next.set(key, {
            ...existing,
            high24h: Math.max(high24h, existing.last),
            low24h: Math.min(low24h, existing.last),
          });
        }
        return next;
      });

      setSparklines((current) => {
        const next = new Map(current);
        for (const result of results) {
          if (result.status !== "fulfilled" || !result.value.window) continue;
          next.set(`jupiter:${result.value.mint}`, result.value.window.closes);
        }
        return next;
      });
    };

    void load();
    const timer = setInterval(() => void load(), JUPITER_WINDOW_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jupiterKey]);

  // ---- Metadata (precision, display symbols) for both venues ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const merged = new Map<string, SymbolMeta>();
      const [binance, jupiter] = await Promise.allSettled([
        binanceSymbols.length > 0
          ? fetchSymbolMeta(binanceSymbols)
          : Promise.resolve(new Map<string, SymbolMeta>()),
        jupiterMints.length > 0
          ? fetchJupiterMeta(jupiterMints)
          : Promise.resolve(new Map<string, SymbolMeta>()),
      ]);
      if (binance.status === "fulfilled") {
        for (const [symbol, m] of binance.value) merged.set(`binance:${symbol}`, m);
      }
      if (jupiter.status === "fulfilled") {
        for (const [mint, m] of jupiter.value) merged.set(`jupiter:${mint}`, m);
      }
      if (!cancelled) setMeta(merged);
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceKey, jupiterKey]);

  // ---- Binance trend lines (Jupiter's come from the window above) ----
  useEffect(() => {
    if (binanceSymbols.length === 0) return;
    const controller = new AbortController();

    const load = async () => {
      const found = await fetchSparklines(binanceSymbols, controller.signal);
      if (controller.signal.aborted) return;
      setSparklines((current) => {
        const next = new Map(current);
        for (const [symbol, closes] of found) {
          next.set(`binance:${symbol}`, closes);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceKey]);

  // ---- Prune state for entries that are no longer watched ----
  const watchedKeys = useMemo(
    () => new Set((entries ?? []).map(entryKey)),
    [entries],
  );
  useEffect(() => {
    if (!entries) return;
    const prune = <T,>(map: Map<string, T>) => {
      let changed = false;
      const next = new Map(map);
      for (const key of next.keys()) {
        if (!watchedKeys.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : map;
    };
    setTickers((current) => prune(current));
    setSparklines((current) => prune(current));
  }, [entries, watchedKeys]);

  // ---- Candle history for the selected entry ----
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setChartLoading(true);
    setLiveCandle(null);

    const load =
      selected.source === "binance"
        ? fetchKlines(selected.id, interval, 500, controller.signal)
        : fetchJupiterChart(selected.id, interval, 500, controller.signal);

    load
      .then((candles) => {
        if (controller.signal.aborted) return;
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
  }, [selected, interval]);

  /**
   * Jupiter cannot stream candles, so the open candle is advanced from the
   * polled price instead: same timestamp, close set to the live price and the
   * extremes widened. Without this a Solana chart would sit frozen between
   * history refetches.
   */
  const selectedKey = selected ? entryKey(selected) : null;
  const selectedTicker = selectedKey ? tickers.get(selectedKey) : undefined;
  const syntheticCandle = useMemo<Candle | null>(() => {
    if (selected?.source !== "jupiter") return null;
    if (!selectedTicker || history.length === 0) return null;
    const last = history[history.length - 1];
    const price = selectedTicker.last;
    return {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
  }, [selected?.source, selectedTicker, history]);

  /**
   * A venue with nothing watched is `idle`, not `live`. Reporting "live" for a
   * path that is not being exercised claims a healthy connection that has not
   * actually been demonstrated.
   */
  const venueStatus = useMemo<VenueStatus>(
    () => ({
      binance: binanceSymbols.length === 0 ? "idle" : socketStatus,
      jupiter: jupiterMints.length === 0 ? "idle" : jupiterStatus,
    }),
    [binanceSymbols.length, jupiterMints.length, socketStatus, jupiterStatus],
  );

  const venueLastOk = useMemo(
    () => ({ binance: binanceOkAt, jupiter: jupiterOkAt }),
    [binanceOkAt, jupiterOkAt],
  );

  return {
    tickers,
    sparklines,
    meta,
    venueStatus,
    venueLastOk,
    lastTickAt,
    history,
    liveCandle: selected?.source === "jupiter" ? syntheticCandle : liveCandle,
    chartLoading,
    error,
  };
}
