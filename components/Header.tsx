import { ConnectionStatus } from "@/components/ConnectionStatus";
import { formatClock } from "@/lib/format";
import type { VenueStatus } from "@/lib/binance/types";

export function Header({
  venueStatus,
  venueLastOk,
  lastTickAt,
}: {
  venueStatus: VenueStatus;
  venueLastOk: { binance: number | null; jupiter: number | null };
  lastTickAt: number | null;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-term-border px-4 py-3">
      <div className="flex items-center gap-2.5">
        {/*
          Served from /public rather than hot-linked, so the header does not
          depend on a third-party host staying up or allowing our origin.

          A plain <img> rather than next/image: the whole app prerenders to
          static output with no backend, and next/image's default loader wants a
          server to optimise through. There is nothing to optimise in an 8.7KB
          64px sprite anyway.

          Decorative — the brand name is right beside it in text, so announcing
          the image too would just be repetition.
        */}
        <img
          src="/mascot.png"
          alt=""
          aria-hidden
          width={28}
          height={28}
          className="size-7 shrink-0 select-none"
          draggable={false}
        />
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-semibold tracking-tight">ANTrader</h1>
          <span className="text-[11px] uppercase tracking-[0.14em] text-term-dim">
            Spot terminal
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="num text-[11px] text-term-dim">
          Last tick {formatClock(lastTickAt)}
        </span>
        <span aria-hidden className="h-3 w-px bg-term-border" />
        {/* One readout per venue: the two are independent data paths, and a
            failure in either must be visible on its own. */}
        <ConnectionStatus
          venue="Binance"
          status={venueStatus.binance}
          lastOkAt={venueLastOk.binance}
          detail="streamed over a WebSocket"
        />
        <span aria-hidden className="h-3 w-px bg-term-border" />
        <ConnectionStatus
          venue="Jupiter"
          status={venueStatus.jupiter}
          lastOkAt={venueLastOk.jupiter}
          detail="polled every 5s (the API has no stream)"
        />
      </div>
    </header>
  );
}
