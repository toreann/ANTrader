/**
 * Binance REST client.
 *
 * IMPORTANT: every call here must run in the BROWSER, never in a server
 * component, route handler or build step. Binance answers requests from server
 * IPs in some regions with HTTP 451, so keeping these fetches client-side runs
 * them from the user's own IP and sidesteps the block entirely. It also keeps
 * rate limits per-user instead of pooled across everyone hitting our origin.
 */
import type {
  Candle,
  KlineInterval,
  RawTicker24h,
  SymbolMeta,
  Ticker,
} from "./types";

const REST_BASE = "https://api.binance.com/api/v3";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${REST_BASE}${path}`, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Binance ${path} responded ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Binance wants the multi-symbol param as a JSON array with no spaces. */
function symbolsParam(symbols: string[]): string {
  return encodeURIComponent(JSON.stringify(symbols));
}

/** tickSize "0.00001" -> 5, "0.01" -> 2, "1.00000000" -> 0. */
export function decimalsFromTickSize(tickSize: string): number {
  const normalized = tickSize.replace(/0+$/, "");
  const dot = normalized.indexOf(".");
  if (dot === -1) return 0;
  return Math.max(0, normalized.length - dot - 1);
}

function toTicker(raw: RawTicker24h): Ticker {
  return {
    source: "binance",
    symbol: raw.symbol,
    last: Number(raw.lastPrice),
    open: Number(raw.openPrice),
    high24h: Number(raw.highPrice),
    low24h: Number(raw.lowPrice),
    change: Number(raw.priceChange),
    changePct: Number(raw.priceChangePercent),
    quoteVolume: Number(raw.quoteVolume),
    updatedAt: raw.closeTime,
  };
}

/**
 * One batched snapshot for the whole watchlist, so the table paints populated
 * rather than empty while the socket connects — and so high/low re-syncs after
 * a reconnect, since ticks that arrived while we were offline are gone.
 */
export async function fetchTickerSnapshot(
  symbols: string[],
  signal?: AbortSignal,
): Promise<Ticker[]> {
  if (symbols.length === 0) return [];
  // The single-symbol form returns an object; the batched form returns an array.
  if (symbols.length === 1) {
    const one = await getJson<RawTicker24h>(
      `/ticker/24hr?symbol=${symbols[0]}`,
      signal,
    );
    return [toTicker(one)];
  }
  const many = await getJson<RawTicker24h[]>(
    `/ticker/24hr?symbols=${symbolsParam(symbols)}`,
    signal,
  );
  return many.map(toTicker);
}

/**
 * Candle history. Binance returns positional arrays:
 * [openTime, open, high, low, close, volume, closeTime, ...]
 */
export async function fetchKlines(
  symbol: string,
  interval: KlineInterval,
  limit = 500,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const rows = await getJson<unknown[][]>(
    `/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    signal,
  );
  return rows.map((r) => ({
    // lightweight-charts wants SECONDS; Binance sends milliseconds.
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
  }));
}

const metaCache = new Map<string, SymbolMeta>();

/**
 * Per-symbol price precision, memoized for the session. exchangeInfo is static
 * enough that refetching it per render would be pure waste.
 */
export async function fetchSymbolMeta(
  symbols: string[],
  signal?: AbortSignal,
): Promise<Map<string, SymbolMeta>> {
  const missing = symbols.filter((s) => !metaCache.has(s));
  if (missing.length > 0) {
    const data = await getJson<{
      symbols: {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        filters: { filterType: string; tickSize?: string }[];
      }[];
    }>(`/exchangeInfo?symbols=${symbolsParam(missing)}`, signal);

    for (const s of data.symbols) {
      const tickSize =
        s.filters.find((f) => f.filterType === "PRICE_FILTER")?.tickSize ??
        "0.01";
      metaCache.set(s.symbol, {
        source: "binance",
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        tickSize,
        priceDecimals: decimalsFromTickSize(tickSize),
      });
    }
  }
  return new Map(
    symbols.flatMap((s) => {
      const meta = metaCache.get(s);
      return meta ? [[s, meta] as const] : [];
    }),
  );
}

/**
 * The 24h trend line shown per watchlist row.
 *
 * 30m x 48 covers the same rolling 24 hours as the high/low/change columns, so
 * the line and the numbers beside it always describe the same window. It is
 * also a quarter of the payload of a 15m series for resolution nobody can see in
 * a ~70px cell.
 */
export const SPARK_INTERVAL: KlineInterval = "30m";
export const SPARK_POINTS = 48;

/**
 * Closing prices for one pair's trend line. The last entry is the in-progress
 * candle, so callers should treat it as stale and substitute the live price.
 */
export async function fetchSparkline(
  symbol: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const candles = await fetchKlines(
    symbol,
    SPARK_INTERVAL,
    SPARK_POINTS,
    signal,
  );
  return candles.map((candle) => candle.close);
}

/**
 * Trend lines for a whole watchlist, fetched concurrently.
 *
 * There is no batched klines endpoint, so this is one request per pair. At
 * request weight 2 each that is negligible against the 6000/minute budget, and
 * a pair that fails is simply omitted rather than failing the whole set.
 */
export async function fetchSparklines(
  symbols: string[],
  signal?: AbortSignal,
): Promise<Map<string, number[]>> {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => [symbol, await fetchSparkline(symbol, signal)] as const),
  );
  const map = new Map<string, number[]>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      const [symbol, closes] = result.value;
      map.set(symbol, closes);
    }
  }
  return map;
}

/**
 * Quote assets worth surfacing first, best-known last so `indexOf` scores them.
 *
 * Binance lists thousands of pairs and has no search endpoint, so relevance has
 * to be decided here. Without this, searching "BTC" buries BTCUSDT under
 * BTCAUD, BTCBIDR and a dozen others.
 */
const QUOTE_PREFERENCE = [
  "BNB",
  "ETH",
  "BTC",
  "TRY",
  "EUR",
  "FDUSD",
  "USDC",
  "USDT",
];

let universe: string[] | null = null;

/**
 * Every spot symbol, for client-side search.
 *
 * Binance has no symbol-search endpoint, so the list has to be held locally.
 * This uses `/ticker/price` (~156KB for ~3.7k symbols) rather than
 * `/exchangeInfo`, which is **17MB** for the same coverage — a 100x difference
 * for data we would throw away. Fetched lazily on first search, not on load, so
 * a user who never searches never pays for it.
 */
export async function fetchSymbolUniverse(
  signal?: AbortSignal,
): Promise<string[]> {
  if (universe) return universe;
  const rows = await getJson<{ symbol: string }[]>("/ticker/price", signal);
  universe = rows.map((row) => row.symbol);
  return universe;
}

/**
 * Binance's leveraged-token naming. These are largely dead products, and
 * without volume data they would otherwise fill the results for any major —
 * searching "BTC" surfaced BTCUP, BTCDOWN and BTCST before BTCUSDC.
 */
const LEVERAGED_SUFFIX = /(?:UP|DOWN|BULL|BEAR)$/;

/** Score a candidate against the query; higher is more relevant. */
function score(symbol: string, query: string): number {
  if (symbol === query) return 1000;
  let value = 0;
  if (symbol.startsWith(query)) value += 500;

  const quote = QUOTE_PREFERENCE.find((q) => symbol.endsWith(q));
  if (quote) {
    value += 10 * (QUOTE_PREFERENCE.indexOf(quote) + 1);
    // Only test the base for the leveraged pattern, so a quote asset ending in
    // those letters cannot be mistaken for one.
    const base = symbol.slice(0, -quote.length);
    if (LEVERAGED_SUFFIX.test(base)) value -= 400;
  }

  // Majors have short tickers, so brevity is a decent tiebreaker.
  value -= symbol.length;
  return value;
}

/** Pure ranking, split out so it can be tested without the network. */
export function rankBinanceSymbols(
  symbols: string[],
  query: string,
  limit = 6,
): string[] {
  const needle = query.trim().toUpperCase();
  if (!needle) return [];
  return symbols
    .filter((symbol) => symbol.includes(needle))
    .sort((a, b) => score(b, needle) - score(a, needle))
    .slice(0, limit);
}

/** Ranked spot symbols matching a free-text query. */
export async function searchBinanceSymbols(
  query: string,
  limit = 6,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!query.trim()) return [];
  return rankBinanceSymbols(await fetchSymbolUniverse(signal), query, limit);
}

/** Cheapest reachability check Binance offers (request weight 1). */
export async function isReachable(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${REST_BASE}/ping`, { signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export type SymbolCheck =
  | { ok: true; meta: SymbolMeta }
  | { ok: false; reason: "unknown" | "unreachable" };

/**
 * Validate a pair before adding it to the watchlist.
 *
 * Binance omits CORS headers on its error responses, so from the browser an
 * unlisted symbol and an unreachable API are indistinguishable — both surface as
 * an opaque "failed to fetch". One cheap ping on the failure path separates
 * them, so the message shown to the user is actually true rather than blaming a
 * typo for a dropped connection.
 */
export async function validateSymbol(
  symbol: string,
  signal?: AbortSignal,
): Promise<SymbolCheck> {
  try {
    const found = await fetchSymbolMeta([symbol], signal);
    const meta = found.get(symbol);
    return meta ? { ok: true, meta } : { ok: false, reason: "unknown" };
  } catch {
    return {
      ok: false,
      reason: (await isReachable(signal)) ? "unknown" : "unreachable",
    };
  }
}
