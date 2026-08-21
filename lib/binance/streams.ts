import type { KlineInterval } from "./types";

const WS_BASE = "wss://stream.binance.com:9443/stream";

/** Rolling-24h ticker stream for one pair. Pushes roughly once per second. */
export function tickerStream(symbol: string): string {
  return `${symbol.toLowerCase()}@ticker`;
}

/** Live candle stream for one pair at one interval. */
export function klineStream(symbol: string, interval: KlineInterval): string {
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

/** A single combined-stream URL for every stream we care about. */
export function combinedStreamUrl(streams: string[]): string {
  return `${WS_BASE}?streams=${streams.join("/")}`;
}
