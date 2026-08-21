/**
 * Binance public market-data types.
 *
 * Binance sends every number as a string to avoid float precision loss on the
 * wire. We keep the raw shapes faithful to the payload and parse exactly once,
 * at the boundary, into the normalized types the UI consumes.
 */

/** Raw `<symbol>@ticker` combined-stream payload (24hrTicker event). */
export interface RawTickerEvent {
  e: "24hrTicker";
  E: number; // event time (ms)
  s: string; // symbol
  p: string; // absolute price change over 24h
  P: string; // percent price change over 24h
  c: string; // last price
  o: string; // open price 24h ago
  h: string; // 24h high
  l: string; // 24h low
  v: string; // base asset volume
  q: string; // quote asset volume
}

/** Raw `<symbol>@kline_<interval>` combined-stream payload. */
export interface RawKlineEvent {
  e: "kline";
  E: number;
  s: string;
  k: {
    t: number; // candle open time (ms)
    T: number; // candle close time (ms)
    i: string; // interval
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean; // is this candle closed?
  };
}

/** Envelope wrapping every message on a combined (`/stream?streams=`) socket. */
export interface CombinedStreamMessage<T> {
  stream: string;
  data: T;
}

/** Raw `GET /api/v3/ticker/24hr` response entry. */
export interface RawTicker24h {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChange: string;
  priceChangePercent: string;
  quoteVolume: string;
  closeTime: number;
}

/**
 * Normalized ticker consumed by the UI.
 *
 * `high24h` / `low24h` are Binance's *rolling* 24-hour window — the same figures
 * shown on exchange sites and TradingView, not a calendar-day session range.
 */
export interface Ticker {
  symbol: string;
  last: number;
  open: number;
  high24h: number;
  low24h: number;
  change: number;
  changePct: number;
  quoteVolume: number;
  updatedAt: number;
}

/** One candle, in the shape lightweight-charts expects (time in SECONDS). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Per-symbol trading rules we care about, from `exchangeInfo`. */
export interface SymbolMeta {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** Minimum price increment, e.g. "0.01" for BTCUSDT, "0.00001" for DOGEUSDT. */
  tickSize: string;
  /** Decimal places derived from tickSize. Never hardcode this. */
  priceDecimals: number;
}

/**
 * Every candle interval this app requests from Binance.
 *
 * Wider than the picker on purpose: the per-row trend line uses 30m, which is a
 * deliberate implementation choice rather than something a user selects.
 */
export type KlineInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

/** The subset offered in the chart's interval picker. */
export const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export type ConnectionStatus = "connecting" | "live" | "reconnecting";
