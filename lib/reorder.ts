/**
 * Pure reorder maths, kept out of the hooks so it can be tested directly.
 *
 * This is index arithmetic that is easy to get subtly wrong and hard to notice
 * by eye — the previous one-dimensional version shipped two incorrect rules
 * before the third stuck, both times caught by measurement rather than looking.
 */

/** One item's resting box, measured before any transform is applied. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Resting position of every item in the grid, in document order. */
export interface GridGeometry {
  rects: Rect[];
}

export interface Offset {
  x: number;
  y: number;
}

/**
 * Switching to a different slot must beat the current one by this much. Without
 * it, a tile parked exactly between two slots flickers between them on every
 * sub-pixel pointer move.
 */
const DEFAULT_HYSTERESIS_PX = 4;

/** Moves one entry to a new index, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function centre(rect: Rect): Offset {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Which slot a dragged item should drop into, by nearest slot centre.
 *
 * A grid wraps, so displacement is genuinely two-dimensional: dragging onto the
 * next item is usually horizontal, and crossing a row boundary is both at once.
 * Nearest-centre handles all of those uniformly, and uniform square tiles make
 * it unambiguous — unlike the ragged-height case that made the old vertical rule
 * fiddly.
 *
 * `from` is compared against its own slot with a hysteresis bonus, so staying
 * put is preferred unless another slot is clearly closer.
 */
export function resolveGridDropTarget(
  from: number,
  dx: number,
  dy: number,
  geometry: GridGeometry,
  count: number,
  hysteresisPx: number = DEFAULT_HYSTERESIS_PX,
): number {
  const { rects } = geometry;
  if (from < 0 || from >= count || rects.length === 0) return from;

  const origin = centre(rects[from]);
  const dragged = { x: origin.x + dx, y: origin.y + dy };

  let best = from;
  // The incumbent gets the hysteresis discount, so a rival must be closer by
  // more than the margin to win.
  let bestDistance = Math.hypot(dragged.x - origin.x, dragged.y - origin.y) - hysteresisPx;

  for (let index = 0; index < Math.min(count, rects.length); index += 1) {
    if (index === from) continue;
    const slot = centre(rects[index]);
    const distance = Math.hypot(dragged.x - slot.x, dragged.y - slot.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * Where every item must be translated to visualise a pending `from -> to` move.
 *
 * Rather than special-casing "shift the items in between by one item", this
 * computes the order the list *would* have and moves each item from its own rect
 * to the rect of the slot it would then occupy. That generalises to any layout —
 * wrapped rows, mixed sizes — and is less code than the branching it replaces.
 *
 * The dragged item is left at zero; its offset is the live pointer delta, which
 * only the caller knows.
 */
export function slotOffsets(
  from: number,
  to: number,
  geometry: GridGeometry,
  count: number,
): Offset[] {
  const { rects } = geometry;
  const total = Math.min(count, rects.length);
  const offsets: Offset[] = Array.from({ length: total }, () => ({ x: 0, y: 0 }));
  if (from < 0 || from >= total || to < 0 || to >= total || from === to) {
    return offsets;
  }

  // reordered[slot] = index of the item that ends up in that slot.
  const reordered = moveItem(
    Array.from({ length: total }, (_, index) => index),
    from,
    to,
  );

  reordered.forEach((item, slot) => {
    if (item === from) return; // follows the pointer, not a slot
    offsets[item] = {
      x: rects[slot].left - rects[item].left,
      y: rects[slot].top - rects[item].top,
    };
  });

  return offsets;
}

/**
 * How many items sit in the first row, i.e. one row's worth of movement.
 *
 * Needed for keyboard Up/Down: the number of columns is a product of CSS grid
 * autoflow and is not otherwise knowable from here, so it is recovered by
 * counting the items that share the first row's `top`.
 */
export function columnsPerRow(geometry: GridGeometry): number {
  const { rects } = geometry;
  if (rects.length === 0) return 1;
  const firstTop = rects[0].top;
  // Tolerance rather than equality: sub-pixel layout means tops in one row are
  // near-identical, not identical.
  const columns = rects.filter((rect) => Math.abs(rect.top - firstTop) < 1).length;
  return Math.max(1, columns);
}
