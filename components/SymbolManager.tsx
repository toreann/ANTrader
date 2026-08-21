"use client";

import { useState } from "react";
import { validateSymbol } from "@/lib/binance/rest";

/**
 * Add a pair to the watchlist, validated against Binance's listed spot symbols
 * so a typo produces a message rather than a permanently blank row.
 */
export function SymbolManager({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (symbol: string) => void;
}) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const symbol = value.trim().toUpperCase();
    if (!symbol) return;

    if (existing.includes(symbol)) {
      setError("Already in the watchlist");
      return;
    }

    setChecking(true);
    setError(null);
    const result = await validateSymbol(symbol);
    setChecking(false);

    if (!result.ok) {
      setError(
        result.reason === "unreachable"
          ? "Cannot reach Binance right now"
          : `${symbol} is not a listed spot pair`,
      );
      return;
    }
    onAdd(symbol);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div className="relative">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="Add pair, e.g. DOGEUSDT"
          aria-label="Add a trading pair"
          aria-invalid={error !== null}
          spellCheck={false}
          autoComplete="off"
          className="num w-52 rounded-md border border-term-border bg-term-bg px-2.5 py-1.5 text-[12px] uppercase text-term-text placeholder:text-term-dim placeholder:normal-case focus:border-term-border-hi focus:outline-none"
        />
        {error && (
          <p
            role="alert"
            className="absolute left-0 top-full mt-1 whitespace-nowrap text-[11px] text-term-down"
          >
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={checking || value.trim().length === 0}
        className="rounded-md border border-term-border bg-term-panel-hi px-3 py-1.5 text-[12px] font-medium text-term-text transition-colors hover:border-term-border-hi disabled:cursor-not-allowed disabled:text-term-dim"
      >
        {checking ? "Checking…" : "Add"}
      </button>
    </form>
  );
}
