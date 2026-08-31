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
 * Where a quote came from.
 *
 * The two venues differ in a way the UI has to be honest about: Binance pushes
 * over a WebSocket about once a second, while Jupiter is REST-only and its price
 * endpoint sends `cache-control: max-age=5`, so Solana tokens can only refresh
 * on a poll.
 */
export type MarketSource = "binance" | "jupiter";

/**
 * Normalized ticker consumed by the UI.
 *
 * `high24h` / `low24h` are always a *rolling* 24-hour window — the basis
 * exchanges quote, not a calendar-day session range. Binance supplies them
 * directly; for Jupiter they are derived from candles, because its price
 * endpoint carries no extremes at all.
 */
export interface Ticker {
  source: MarketSource;
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

/** Per-symbol display and precision rules. */
export interface SymbolMeta {
  source: MarketSource;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** Minimum price increment, e.g. "0.01" for BTCUSDT, "0.00001" for DOGEUSDT. */
  tickSize: string;
  /** Decimal places derived from tickSize. Never hardcode this. */
  priceDecimals: number;
  /** Solana mint address. Jupiter only; absent for Binance pairs. */
  mint?: string;
  /**
   * The token's ON-CHAIN decimals — how many base units make one whole token
   * (9 for SOL, 6 for USDC).
   *
   * Emphatically NOT `priceDecimals`, which is only how many digits to display.
   * Confusing the two silently misquotes an amount by orders of magnitude, so
   * anything converting to base units must use this and must refuse to guess
   * when it is absent.
   */
  tokenDecimals?: number;
  /** Token icon URL, when the venue provides one. */
  icon?: string;
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

/**
 * Health of one venue's data path.
 *
 * `idle` matters: with nothing watched from a venue there is nothing being
 * fetched, and reporting "live" in that case would claim a healthy connection
 * that does not exist.
 */
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting";

/** Per-venue health, so one venue failing cannot be hidden by the other. */
export interface VenueStatus {
  binance: ConnectionStatus;
  jupiter: ConnectionStatus;
}
