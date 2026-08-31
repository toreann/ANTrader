/**
 * Jupiter REST client.
 *
 * Like the Binance client, every call here runs in the BROWSER. Keeping it
 * client-side means no origin of ours is rate-limited on behalf of all users,
 * and the whole app still prerenders to static output.
 *
 * No API key: `lite-api.jup.ag` is the keyless tier. The paid `api.jup.ag` tier
 * needs a key and is not used.
 */
import type { Candle, Interval, SymbolMeta, Ticker } from "../binance/types";
import {
  JUPITER_INTERVAL,
  JUPITER_WINDOW_CANDLES,
  JUPITER_WINDOW_INTERVAL,
  type RawJupiterChart,
  type RawJupiterPrice,
  type RawJupiterQuote,
  type RawJupiterToken,
  type SwapQuote,
} from "./types";

const LITE_BASE = "https://lite-api.jup.ag";
/** Undocumented; see the note in ./types.ts. */
const DATA_BASE = "https://datapi.jup.ag";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Jupiter ${new URL(url).pathname} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Latest USD prices for many mints in one request. */
export async function fetchJupiterPrices(
  mints: string[],
  signal?: AbortSignal,
): Promise<Map<string, RawJupiterPrice>> {
  if (mints.length === 0) return new Map();
  const data = await getJson<Record<string, RawJupiterPrice | null>>(
    `${LITE_BASE}/price/v3?ids=${mints.join(",")}`,
    signal,
  );
  const out = new Map<string, RawJupiterPrice>();
  for (const [mint, price] of Object.entries(data)) {
    // A mint with no route or no liquidity comes back null rather than absent.
    if (price && Number.isFinite(price.usdPrice)) out.set(mint, price);
  }
  return out;
}

/**
 * Candles for one mint.
 *
 * Note the unit mismatch, which is a real trap: `from`/`to` are MILLISECONDS
 * while the `time` on each returned candle is SECONDS. lightweight-charts wants
 * seconds, so the returned value passes through untouched.
 */
export async function fetchJupiterCandles(
  mint: string,
  interval: string,
  candles: number,
  spanMs: number,
  signal?: AbortSignal,
  nowMs: number = Date.now(),
): Promise<Candle[]> {
  const url =
    `${DATA_BASE}/v2/charts/${mint}` +
    `?interval=${interval}&from=${nowMs - spanMs}&to=${nowMs}&candles=${candles}`;
  const data = await getJson<RawJupiterChart>(url, signal);
  return (data.candles ?? []).map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** Candle history for the main chart, at one of the app's own intervals. */
export async function fetchJupiterChart(
  mint: string,
  interval: Interval,
  limit = 500,
  signal?: AbortSignal,
): Promise<Candle[]> {
  return fetchJupiterCandles(
    mint,
    JUPITER_INTERVAL[interval],
    limit,
    INTERVAL_MS[interval] * limit,
    signal,
  );
}

export interface JupiterWindow {
  high24h: number;
  low24h: number;
  /** Closes oldest-to-newest, for the trend line. */
  closes: number[];
}

/**
 * The rolling 24-hour window for one mint, derived from candles.
 *
 * Jupiter's price endpoint carries no extremes at all, so unlike Binance these
 * have to be computed. One 15-minute series covers both the extremes and the
 * trend line, so a token costs one request rather than two.
 *
 * The extremes are therefore accurate to 15 minutes of granularity rather than
 * tick-exact. Callers widen them with the live price, which is what keeps a new
 * high visible immediately instead of at the next refresh.
 */
export async function fetchJupiterWindow(
  mint: string,
  signal?: AbortSignal,
): Promise<JupiterWindow | null> {
  const candles = await fetchJupiterCandles(
    mint,
    JUPITER_WINDOW_INTERVAL,
    JUPITER_WINDOW_CANDLES,
    86_400_000,
    signal,
  );
  if (candles.length === 0) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const candle of candles) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  return { high24h: high, low24h: low, closes: candles.map((c) => c.close) };
}

/** Decimal places to quote a USD price at, scaled to its magnitude. */
export function usdPriceDecimals(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 4;
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  if (price >= 0.0001) return 7;
  return 9;
}

const metaCache = new Map<string, SymbolMeta>();

/** Token metadata by mint, memoized for the session. */
export async function fetchJupiterMeta(
  mints: string[],
  signal?: AbortSignal,
): Promise<Map<string, SymbolMeta>> {
  const missing = mints.filter((mint) => !metaCache.has(mint));
  if (missing.length > 0) {
    // The search endpoint accepts a comma-separated list of mints as the query.
    const tokens = await getJson<RawJupiterToken[]>(
      `${LITE_BASE}/tokens/v2/search?query=${missing.join(",")}`,
      signal,
    );
    for (const token of tokens) {
      metaCache.set(token.id, {
        source: "jupiter",
        symbol: token.id,
        baseAsset: token.symbol,
        quoteAsset: "USD",
        // Jupiter quotes in USD with no tick size, so precision follows the
        // price's magnitude instead of an exchange-published increment.
        tickSize: "",
        priceDecimals: usdPriceDecimals(token.usdPrice ?? 0),
        mint: token.id,
        tokenDecimals: token.decimals,
        icon: token.icon,
      });
    }
  }
  return new Map(
    mints.flatMap((mint) => {
      const meta = metaCache.get(mint);
      return meta ? [[mint, meta] as const] : [];
    }),
  );
}

/**
 * Pure ranking, split out so it can be tested without the network.
 *
 * Ordered comparison rather than a weighted sum, because the tiers must not be
 * able to outweigh each other:
 *
 *  1. Verification, absolutely. Anyone can mint a token called "BTC" — a search
 *     for it returns several unverified impostors, and an earlier version of this
 *     ranked them above the real WBTC because an exact symbol match scored
 *     higher than being verified. Relevance must never promote a look-alike over
 *     a vetted token.
 *  2. Symbol relevance, so "SOL" surfaces SOL and not BNSOL — Jupiter's own
 *     order is largely by liquidity, which buries the token being searched for
 *     under its own derivatives.
 *  3. Liquidity, only to break ties inside a tier.
 */
export function rankJupiterTokens(
  tokens: RawJupiterToken[],
  query: string,
): RawJupiterToken[] {
  const needle = query.trim().toUpperCase();
  const relevance = (token: RawJupiterToken) => {
    const symbol = (token.symbol ?? "").toUpperCase();
    if (symbol === needle) return 2;
    if (symbol.startsWith(needle)) return 1;
    return 0;
  };
  return [...tokens].sort((a, b) => {
    if (!!a.isVerified !== !!b.isVerified) return a.isVerified ? -1 : 1;
    const byRelevance = relevance(b) - relevance(a);
    if (byRelevance !== 0) return byRelevance;
    return (b.liquidity ?? 0) - (a.liquidity ?? 0);
  });
}

/** Free-text token search, for adding a Solana token to the watchlist. */
export async function searchJupiterTokens(
  query: string,
  signal?: AbortSignal,
): Promise<RawJupiterToken[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const tokens = await getJson<RawJupiterToken[]>(
    `${LITE_BASE}/tokens/v2/search?query=${encodeURIComponent(trimmed)}`,
    signal,
  );
  return rankJupiterTokens(tokens, trimmed);
}

/** Build a Ticker from a Jupiter price plus its derived 24h window. */
export function toJupiterTicker(
  mint: string,
  price: RawJupiterPrice,
  window: JupiterWindow | null,
): Ticker {
  const last = price.usdPrice;
  const changePct = price.priceChange24h ?? 0;
  // open is implied by the percentage, since Jupiter does not publish it.
  const open = changePct === -100 ? last : last / (1 + changePct / 100);
  return {
    source: "jupiter",
    symbol: mint,
    last,
    open,
    // Widen the derived extremes with the live price so a fresh high or low
    // shows immediately rather than at the next candle refresh.
    high24h: Math.max(window?.high24h ?? last, last),
    low24h: Math.min(window?.low24h ?? last, last),
    change: last - open,
    changePct,
    quoteVolume: price.liquidity ?? 0,
    updatedAt: Date.now(),
  };
}

/**
 * A read-only routing quote. Signs nothing and moves nothing — this is the
 * price-discovery half of Jupiter's swap API, not the execution half.
 */
export async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  /** Amount in the input token's base units. */
  amount: string,
  slippageBps: number,
  inputDecimals: number,
  outputDecimals: number,
  signal?: AbortSignal,
): Promise<SwapQuote> {
  const raw = await getJson<RawJupiterQuote>(
    `${LITE_BASE}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}` +
      `&amount=${amount}&slippageBps=${slippageBps}`,
    signal,
  );

  const scale = (value: string, decimals: number) =>
    Number(value) / 10 ** decimals;
  const inUi = scale(raw.inAmount, inputDecimals);
  const outUi = scale(raw.outAmount, outputDecimals);

  return {
    inputMint: raw.inputMint,
    outputMint: raw.outputMint,
    inAmount: inUi,
    outAmount: outUi,
    minimumReceived: scale(raw.otherAmountThreshold, outputDecimals),
    rate: inUi > 0 ? outUi / inUi : 0,
    priceImpactPct: Number(raw.priceImpactPct) || 0,
    slippageBps: raw.slippageBps,
    route: raw.routePlan
      .map((hop) => hop.swapInfo?.label)
      .filter((label): label is string => Boolean(label)),
    usdValue: raw.swapUsdValue != null ? Number(raw.swapUsdValue) : null,
  };
}

/** Convert a human amount to base units without floating-point drift. */
export function toBaseUnits(amount: string, decimals: number): string | null {
  const trimmed = amount.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    // Truncate rather than round: quoting for more than the user typed would be
    // the wrong direction to be wrong in.
    return `${whole}${fraction.slice(0, decimals)}`.replace(/^0+(?=\d)/, "");
  }
  const padded = fraction.padEnd(decimals, "0");
  const units = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  return units === "" ? "0" : units;
}
