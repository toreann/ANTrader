/**
 * Pure maths for the square chart's size.
 *
 * The chart occupies an N x N block of the same square cells the tiles use, so
 * its size is an integer. Dragging still feels continuous — the pointer is
 * translated to the nearest whole span here.
 */

export const MIN_SPAN = 2;
export const MAX_SPAN = 4;
export const DEFAULT_SPAN = 3;

export function clampSpan(
  value: number,
  min: number = MIN_SPAN,
  max: number = MAX_SPAN,
): number {
  // NaN only. Math.min/max propagate NaN, but the infinities clamp correctly on
  // their own — treating them as invalid sent +Infinity to the default instead
  // of the ceiling.
  if (Number.isNaN(value)) return DEFAULT_SPAN;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export interface PointerToSpan {
  pointerX: number;
  pointerY: number;
  /** The chart's fixed right edge — it is anchored to the last column line. */
  right: number;
  /** The chart's fixed top edge — it is anchored to the first row. */
  top: number;
  /** One grid cell's side length. */
  cell: number;
  /** Gap between cells. */
  gap: number;
  min?: number;
  max?: number;
}

/**
 * Which span the pointer is asking for, dragging the chart's bottom-left corner.
 *
 * The chart is pinned top-right, so growing it means extending left and down at
 * once. Either direction is honoured by taking whichever axis the pointer has
 * pulled further — dragging straight left and dragging straight down both work.
 *
 * A span of N is `N*cell + (N-1)*gap` across, so the inverse adds one gap before
 * dividing. Forgetting that gap makes the chart lag a cell behind the pointer at
 * larger sizes.
 */
/** Pixel side length of a chart spanning `span` cells. */
export function sizeForSpan(span: number, cell: number, gap: number): number {
  return span * cell + (span - 1) * gap;
}

/**
 * The exact square side the pointer is asking for, unsnapped.
 *
 * Drives the drag preview. Snapping only on release is what makes the gesture
 * feel continuous while still landing on the grid: without it there is a whole
 * cell of travel where nothing moves at all.
 */
export function sizeFromPointer({
  pointerX,
  pointerY,
  right,
  top,
  cell,
  gap,
  min = MIN_SPAN,
  max = MAX_SPAN,
}: PointerToSpan): number {
  const pulled = Math.max(right - pointerX, pointerY - top);
  if (!Number.isFinite(pulled)) return sizeForSpan(min, cell, gap);
  return Math.min(
    sizeForSpan(max, cell, gap),
    Math.max(sizeForSpan(min, cell, gap), pulled),
  );
}

export function spanFromPointer({
  pointerX,
  pointerY,
  right,
  top,
  cell,
  gap,
  min = MIN_SPAN,
  max = MAX_SPAN,
}: PointerToSpan): number {
  const stride = cell + gap;
  if (!stride || !Number.isFinite(stride)) return min;
  const pulled = Math.max(right - pointerX, pointerY - top);
  return clampSpan((pulled + gap) / stride, min, max);
}
