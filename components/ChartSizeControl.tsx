"use client";

/**
 * Chart size, as a step rather than a drag.
 *
 * The chart occupies an N x N block of the same square cells the tiles use —
 * that is what keeps it square without measuring anything, and it makes its size
 * genuinely discrete. A free-dragging divider would report fractions the layout
 * cannot honour, so this exposes the real quantity: how many cells across.
 */
export function ChartSizeControl({
  span,
  min,
  max,
  canGrow,
  canShrink,
  onGrow,
  onShrink,
}: {
  span: number;
  min: number;
  max: number;
  canGrow: boolean;
  canShrink: boolean;
  onGrow: () => void;
  onShrink: () => void;
}) {
  return (
    <div
      // Hidden below sm for the same reason as the corner grip: the chart is
      // full-width there whatever the span.
      className="hidden items-center gap-0.5 rounded-md border border-term-border bg-term-bg p-0.5 sm:flex"
      role="group"
      aria-label="Chart size"
    >
      <button
        type="button"
        onClick={onShrink}
        disabled={!canShrink}
        aria-label="Make the chart smaller"
        className="rounded px-1.5 py-0.5 text-[12px] leading-none text-term-muted transition-colors hover:bg-term-panel-hi hover:text-term-text disabled:cursor-not-allowed disabled:text-term-dim"
      >
        −
      </button>
      <span
        className="num min-w-8 text-center text-[10px] tabular-nums text-term-muted"
        // Announced as a value in range, so the control is intelligible without
        // seeing the grid it refers to.
        role="status"
        aria-label={`Chart spans ${span} of ${max} cells`}
        title={`Chart size ${span}×${span} (${min}–${max})`}
      >
        {span}×{span}
      </span>
      <button
        type="button"
        onClick={onGrow}
        disabled={!canGrow}
        aria-label="Make the chart larger"
        className="rounded px-1.5 py-0.5 text-[12px] leading-none text-term-muted transition-colors hover:bg-term-panel-hi hover:text-term-text disabled:cursor-not-allowed disabled:text-term-dim"
      >
        +
      </button>
    </div>
  );
}
