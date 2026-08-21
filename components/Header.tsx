import { ConnectionStatus } from "@/components/ConnectionStatus";
import { formatClock } from "@/lib/format";
import type { ConnectionStatus as Status } from "@/lib/binance/types";

export function Header({
  status,
  lastTickAt,
}: {
  status: Status;
  lastTickAt: number | null;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-term-border px-4 py-3">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-[15px] font-semibold tracking-tight">ANTrader</h1>
        <span className="text-[11px] uppercase tracking-[0.14em] text-term-dim">
          Spot terminal
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="num text-[11px] text-term-dim">
          Last tick {formatClock(lastTickAt)}
        </span>
        <span aria-hidden className="h-3 w-px bg-term-border" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-term-dim">
          Binance
        </span>
        <ConnectionStatus status={status} />
      </div>
    </header>
  );
}
