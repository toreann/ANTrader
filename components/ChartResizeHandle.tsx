"use client";

/**
 * The grip for resizing the square chart.
 *
 * It sits at the chart's **bottom-left** corner because that is the only corner
 * that can move: the chart is anchored to the grid's top-right, so growing it
 * extends left and down together. Dragging either way works — the span follows
 * whichever axis the pointer pulls further.
 *
 * Focusable and arrow-key operable, so the size is reachable without a pointer
 * even though the stepper in the toolbar is the easier route.
 */
export function ChartResizeHandle({
  span,
  min,
  max,
  dragging,
  handlers,
}: {
  span: number;
  min: number;
  max: number;
  dragging: boolean;
  handlers: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
  };
}) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Chart size — drag or use the arrow keys"
      aria-valuenow={span}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${span} by ${span} cells`}
      title={`Chart size ${span}×${span} — drag to resize`}
      {...handlers}
      onPointerCancel={handlers.onPointerUp}
      // The gesture must not be turned into a scroll by the browser.
      style={{ touchAction: "none" }}
      // Hidden below sm: there the chart takes the full width regardless of
      // span, so the control would be present and inert.
      className={`group absolute bottom-0 left-0 z-10 hidden size-6 cursor-nesw-resize place-items-center focus:outline-none sm:grid ${
        dragging ? "cursor-nesw-resize" : ""
      }`}
    >
      {/* Two short strokes reading as a corner, mirroring the OS convention. */}
      <svg
        viewBox="0 0 10 10"
        aria-hidden
        className={`size-2.5 transition-colors ${
          dragging
            ? "text-term-accent"
            : "text-term-dim group-hover:text-term-text group-focus-visible:text-term-accent"
        }`}
      >
        <path
          d="M9 1 L1 9 M9 5.5 L5.5 9"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
