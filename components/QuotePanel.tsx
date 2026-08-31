"use client";

import { useEffect, useState } from "react";
import {
  fetchJupiterQuote,
  toBaseUnits,
  usdPriceDecimals,
} from "@/lib/jupiter/rest";
import type { SwapQuote } from "@/lib/jupiter/types";
import { formatPercent, formatPrice } from "@/lib/format";
import type { SymbolMeta } from "@/lib/binance/types";

/** USDC on Solana — the quote leg every price is expressed against. */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;

const SLIPPAGE_OPTIONS = [10, 50, 100] as const;
const QUOTE_DEBOUNCE_MS = 350;
/** Refresh cadence, so a displayed quote never goes quietly stale. */
const QUOTE_REFRESH_MS = 10_000;

/**
 * A read-only Jupiter routing quote for the selected Solana token.
 *
 * This is price discovery, not execution: it calls the quote endpoint only, and
 * deliberately builds, signs and sends nothing. There is no wallet connection
 * here and no transaction — the numbers are indicative, and the panel says so.
 */
export function QuotePanel({
  mint,
  meta,
  /**
   * The token's ON-CHAIN decimals, not its display precision. Required rather
   * than defaulted: guessing this misquotes the amount by orders of magnitude,
   * which is the one mistake a quote panel must never make.
   */
  tokenDecimals,
}: {
  mint: string;
  meta: SymbolMeta | undefined;
  tokenDecimals: number;
}) {
  const [amount, setAmount] = useState("1");
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbol = meta?.baseAsset ?? "token";

  useEffect(() => {
    const units = toBaseUnits(amount, tokenDecimals);
    if (units === null || units === "0") {
      setQuote(null);
      setError(amount.trim() === "" ? null : "Enter a valid amount");
      return;
    }
    if (mint === USDC_MINT) {
      setQuote(null);
      setError("USDC is the quote leg — pick another token");
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      setLoading(true);
      try {
        const next = await fetchJupiterQuote(
          mint,
          USDC_MINT,
          units,
          slippageBps,
          tokenDecimals,
          USDC_DECIMALS,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setQuote(next);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Could not fetch a quote",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      void run();
      timer = setInterval(() => void run(), QUOTE_REFRESH_MS);
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(debounce);
      if (timer) clearInterval(timer);
      controller.abort();
    };
  }, [mint, amount, slippageBps, tokenDecimals]);

  // Impact is the number that actually matters at size, so it earns colour.
  const impact = quote?.priceImpactPct ?? 0;
  const impactColor =
    impact >= 1
      ? "text-term-down"
      : impact >= 0.1
        ? "text-term-text"
        : "text-term-up";

  return (
    <section className="flex flex-col gap-2.5 border-t border-term-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-term-muted">
          Jupiter quote
        </h3>
        <span className="text-[10px] text-term-dim">indicative · read-only</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-term-dim">
            Sell
          </span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            spellCheck={false}
            aria-label={`Amount of ${symbol} to quote`}
            className="num w-24 rounded border border-term-border bg-term-bg px-2 py-1 text-[12px] focus:border-term-border-hi focus:outline-none"
          />
          <span className="num text-[11px] text-term-muted">{symbol}</span>
        </label>

        <div
          role="group"
          aria-label="Slippage tolerance"
          className="flex items-center gap-0.5 rounded border border-term-border bg-term-bg p-0.5"
        >
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              aria-pressed={slippageBps === bps}
              onClick={() => setSlippageBps(bps)}
              className={`num rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                slippageBps === bps
                  ? "bg-term-border-hi text-term-text"
                  : "text-term-muted hover:text-term-text"
              }`}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[11px] text-term-down">
          {error}
        </p>
      ) : quote ? (
        <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-term-muted">Receive</dt>
          <dd className="text-right font-semibold">
            {formatPrice(quote.outAmount, 4)} USDC
          </dd>

          <dt className="text-term-muted">Rate</dt>
          <dd className="text-right">
            1 {symbol} = {formatPrice(quote.rate, usdPriceDecimals(quote.rate))}{" "}
            USDC
          </dd>

          <dt className="text-term-muted">Price impact</dt>
          <dd className={`text-right ${impactColor}`}>
            {formatPercent(impact)}
          </dd>

          <dt className="text-term-muted" title={`At ${slippageBps / 100}% slippage`}>
            Min received
          </dt>
          <dd className="text-right">
            {formatPrice(quote.minimumReceived, 4)} USDC
          </dd>

          <dt className="text-term-muted">Route</dt>
          <dd className="truncate text-right" title={quote.route.join(" → ")}>
            {quote.route.join(" → ") || "—"}
          </dd>
        </dl>
      ) : (
        <p className="text-[11px] text-term-dim">
          {loading ? "Quoting…" : "Enter an amount to quote."}
        </p>
      )}
    </section>
  );
}
