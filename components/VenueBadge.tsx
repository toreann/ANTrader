import type { MarketSource } from "@/lib/binance/types";

/**
 * Which venue a tile's numbers come from.
 *
 * Not decoration: the two sources refresh at genuinely different rates —
 * Binance streams about once a second, Jupiter polls every five — so a tile
 * that appears to move less is not necessarily a quieter market. Labelling the
 * venue is what makes that legible instead of confusing.
 */
const LABEL: Record<MarketSource, string> = {
  binance: "Binance",
  jupiter: "Jup",
};

const TITLE: Record<MarketSource, string> = {
  binance: "Binance spot — streamed live over a WebSocket",
  jupiter: "Jupiter (Solana) — polled every 5s; the API has no stream",
};

export function VenueBadge({ source }: { source: MarketSource }) {
  return (
    <span
      title={TITLE[source]}
      className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold tracking-[0.02em] ${
        source === "jupiter"
          ? "bg-term-accent/15 text-term-accent"
          : "bg-term-border text-term-muted"
      }`}
    >
      {LABEL[source]}
    </span>
  );
}
