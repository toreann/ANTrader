/**
 * Jupiter (jup.ag) public API types.
 *
 * Two hosts are in play, and the difference matters:
 *
 *  - `lite-api.jup.ag` is the documented, keyless tier — prices, token search
 *    and swap quotes.
 *  - `datapi.jup.ag` serves OHLCV and is what Jupiter's own frontend uses. It is
 *    NOT in their published API surface, so treat it as load-bearing but
 *    unsupported: it can change without notice, and every caller of it degrades
 *    gracefully rather than throwing.
 */
import type { Interval } from "../binance/types";

/** `GET lite-api.jup.ag/price/v3?ids=<mint,...>` — keyed by mint. */
export interface RawJupiterPrice {
  usdPrice: number;
  /** Percent change over 24h. */
  priceChange24h: number;
  decimals: number;
  liquidity: number;
  blockId: number;
}

/** `GET lite-api.jup.ag/tokens/v2/search?query=` — one entry per match. */
export interface RawJupiterToken {
  id: string; // mint address
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
  isVerified?: boolean;
  usdPrice?: number;
  liquidity?: number;
  mcap?: number;
  stats24h?: {
    priceChange?: number;
    buyVolume?: number;
    sellVolume?: number;
  };
}

/** `GET datapi.jup.ag/v2/charts/<mint>` */
export interface RawJupiterCandle {
  /**
   * Candle open time in SECONDS — even though the `from`/`to` query params for
   * this endpoint are MILLISECONDS. The mismatch is real and easy to trip on.
   */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RawJupiterChart {
  candles: RawJupiterCandle[];
}

/** `GET lite-api.jup.ag/swap/v1/quote` — a read-only routing quote. */
export interface RawJupiterQuote {
  inputMint: string;
  outputMint: string;
  /** Base units (integer strings), scaled by the token's decimals. */
  inAmount: string;
  outAmount: string;
  /** Worst-case output at the requested slippage. */
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string | number;
  swapUsdValue?: string | number;
  routePlan: { swapInfo?: { label?: string } }[];
}

/** A quote in the shape the UI renders. */
export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  /** Worst-case output at the requested slippage. */
  minimumReceived: number;
  /** Output units per one input unit. */
  rate: number;
  priceImpactPct: number;
  slippageBps: number;
  /** AMM labels in route order, e.g. ["Quantum"] or ["Orca", "Raydium"]. */
  route: string[];
  usdValue: number | null;
}

/**
 * Jupiter's candle interval enum. Deliberately a separate mapping from the
 * app's own `Interval`: these are the venue's wire values, not ours.
 */
export const JUPITER_INTERVAL: Record<Interval, string> = {
  "1m": "1_MINUTE",
  "5m": "5_MINUTE",
  "15m": "15_MINUTE",
  "1h": "1_HOUR",
  "4h": "4_HOUR",
  "1d": "1_DAY",
};

/** Interval used to derive the rolling 24h window and the trend line. */
export const JUPITER_WINDOW_INTERVAL = "15_MINUTE";
export const JUPITER_WINDOW_CANDLES = 96; // 96 x 15m = 24h
