/**
 * Pure reorder maths, kept out of the hooks so it can be tested directly.
 *
 * Both functions below are the kind of index arithmetic that is easy to get
 * subtly wrong and hard to notice by eye — the drop-target rule in particular
 * shipped once with a centre-to-centre comparison that made the list sit still
 * until a full row of travel.
 */

/** Resting position of each item in the list, measured before any transform. */
export interface ListGeometry {
  tops: number[];
  heights: number[];
}

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

/**
 * Which index a dragged item should drop into.
 *
 * The rule: the dragged item's leading edge must pass the *midpoint* of the
 * neighbour it is moving onto. Two earlier rules were both wrong —
 *
 *  - centre against the neighbour's centre required a full item of travel
 *    before anything moved, because adjacent equal-height items have centres
 *    exactly one item apart. It read as the drag being broken.
 *  - centre against the neighbour's near edge fixed the feel for equal heights
 *    but scales badly: a short item leapfrogged a much taller neighbour after
 *    barely touching it, which matters because the mobile cards are not all the
 *    same height.
 *
 * Leading-edge against the neighbour's midpoint gives half-an-item for uniform
 * rows and asks for proportionally more travel to displace a taller neighbour.
 */
export function resolveDropTarget(
  from: number,
  delta: number,
  geometry: ListGeometry,
  count: number,
): number {
  const { tops, heights } = geometry;
  if (from < 0 || from >= count || tops.length === 0) return from;

  const top = tops[from] + delta;
  const bottom = top + (heights[from] ?? 0);

  let to = from;
  while (to < count - 1 && bottom > tops[to + 1] + heights[to + 1] / 2) to += 1;
  while (to > 0 && top < tops[to - 1] + heights[to - 1] / 2) to -= 1;
  return to;
}
