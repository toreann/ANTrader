"use client";

/**
 * The grip that starts a reorder.
 *
 * Always visible rather than revealed on hover: a hover-only control is
 * invisible to keyboard and touch users, and leaves everyone else guessing that
 * the list can be reordered at all.
 *
 * It is a real button so it can be tabbed to and driven with arrow keys, which
 * is the only way to reorder without a pointer.
 */
export function DragHandle({
  label,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: {
  label: string;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} — drag to reorder, or use the arrow keys`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      // Stop the press from also selecting the row.
      onClick={(event) => event.stopPropagation()}
      // 24x24 hit area around the small grip glyph, per WCAG 2.5.8.
      className={`grid size-6 shrink-0 place-items-center rounded text-term-dim transition-colors hover:bg-term-border hover:text-term-text ${
        dragging ? "cursor-grabbing text-term-text" : "cursor-grab"
      }`}
      // Without this the browser scrolls the panel instead of reporting the
      // pointer moves this gesture depends on.
      style={{ touchAction: "none" }}
    >
      <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden fill="currentColor">
        {[2, 7, 12].map((y) =>
          [1, 6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />),
        )}
      </svg>
    </button>
  );
}
