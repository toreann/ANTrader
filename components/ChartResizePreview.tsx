"use client";

/**
 * The outline that follows the pointer while the chart is being resized.
 *
 * The grid is not reflowed per frame — only this overlay moves. That keeps the
 * gesture continuous (the pointer always has something following it, instead of
 * a full cell of travel where nothing happens) while the real layout changes
 * exactly once, on release.
 *
 * Anchored top-right like the chart itself, because that corner cannot move.
 */
export function ChartResizePreview({
  size,
  span,
}: {
  /** Unsnapped side length in pixels, straight from the pointer. */
  size: number;
  /** The span this would land on, so the outcome is never a surprise. */
  span: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 z-20 rounded-lg border-2 border-dashed border-term-accent/70 bg-term-accent/5"
      style={{ width: size, height: size }}
    >
      <span className="num absolute bottom-1 left-1 rounded bg-term-accent/20 px-1 py-px text-[10px] font-semibold text-term-accent">
        {span}×{span}
      </span>
    </div>
  );
}
