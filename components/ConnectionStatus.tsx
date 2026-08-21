import type { ConnectionStatus as Status } from "@/lib/binance/types";

const LABELS: Record<Status, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
};

/**
 * The honest signal that what is on screen is actually current. Without it a
 * frozen socket is indistinguishable from a quiet market.
 */
export function ConnectionStatus({ status }: { status: Status }) {
  const isLive = status === "live";
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          isLive
            ? "bg-term-up pulse-dot"
            : status === "reconnecting"
              ? "bg-term-down"
              : "bg-term-muted"
        }`}
      />
      <span
        className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
          isLive ? "text-term-muted" : "text-term-text"
        }`}
        role="status"
      >
        {LABELS[status]}
      </span>
    </div>
  );
}
