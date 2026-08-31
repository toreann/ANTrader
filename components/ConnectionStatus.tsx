import { formatClock } from "@/lib/format";
import type { ConnectionStatus as Status } from "@/lib/binance/types";

const LABELS: Record<Status, string> = {
  idle: "Idle",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Retrying",
};

const DOT: Record<Status, string> = {
  idle: "bg-term-dim",
  connecting: "bg-term-muted",
  live: "bg-term-up pulse-dot",
  reconnecting: "bg-term-down pulse-dot",
};

/**
 * Per-venue health readout.
 *
 * The honest signal that what is on screen is actually current: without it a
 * dead socket or a failing poll is indistinguishable from a quiet market. Each
 * venue gets its own, because one of them failing must not be masked by the
 * other still working.
 */
export function ConnectionStatus({
  venue,
  status,
  lastOkAt,
  detail,
}: {
  venue: string;
  status: Status;
  lastOkAt: number | null;
  /** How this venue is read, shown on hover. */
  detail: string;
}) {
  const title =
    status === "idle"
      ? `${venue}: nothing watched from this venue`
      : `${venue}: ${detail}${
          lastOkAt ? ` · last response ${formatClock(lastOkAt)}` : ""
        }`;

  return (
    <span
      className="flex items-center gap-1.5"
      title={title}
      role="status"
      aria-label={`${venue} ${LABELS[status]}`}
    >
      <span className="text-[11px] uppercase tracking-[0.14em] text-term-dim">
        {venue}
      </span>
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[status]}`} />
      <span
        className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
          status === "live" ? "text-term-muted" : "text-term-text"
        }`}
      >
        {LABELS[status]}
      </span>
    </span>
  );
}
