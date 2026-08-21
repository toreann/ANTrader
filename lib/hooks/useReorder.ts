"use client";

import { useCallback, useRef, useState } from "react";
import { resolveDropTarget, type ListGeometry } from "@/lib/reorder";

/**
 * Drag-to-reorder for a vertical list, built on Pointer Events.
 *
 * Pointer Events rather than the HTML5 drag-and-drop API because that API does
 * not fire on touch devices at all, and this list has a mobile presentation.
 * One pointer code path covers mouse, touch and pen; arrow keys cover the rest.
 *
 * The hook reads geometry from the container's children rather than tracking a
 * ref per item, which works because the list always renders exactly one child
 * per entry — so `children[i]` is always entry `i`, placeholders included.
 */

/** Movement required before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

/** How long after a drop a click is still treated as part of that gesture. */
const CLICK_SUPPRESSION_MS = 300;

interface DragState {
  from: number;
  to: number;
  /** Pixels the pressed item has been moved. */
  delta: number;
  /** Height of the pressed item, i.e. the gap the others must open up. */
  height: number;
}

export function useReorder(
  count: number,
  onReorder: (from: number, to: number) => void,
) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  /**
   * Callback ref rather than a ref object, so one hook can attach to a `tbody`
   * or a `div` without fighting TypeScript's ref variance.
   */
  const setContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
  }, []);

  // Mirrored so pointerup can read the final position without depending on the
  // render that produced it.
  const dragRef = useRef<DragState | null>(null);
  const geometry = useRef<ListGeometry | null>(null);
  const press = useRef<{ from: number; startY: number; active: boolean } | null>(
    null,
  );
  /**
   * When the last drag finished, not merely whether one did.
   *
   * A boolean flag goes stale: a drag that ends over a different element than it
   * began on produces no click to consume the flag, so the next unrelated click
   * gets swallowed. Timestamping it means the suppression can only ever apply to
   * the click belonging to the gesture that just ended.
   */
  const draggedAt = useRef<number | null>(null);

  const applyDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const measure = useCallback((): ListGeometry | null => {
    const container = containerRef.current;
    if (!container) return null;
    // Measured before any transform is applied, so these are the resting slots.
    const rects = [...container.children].map((child) =>
      child.getBoundingClientRect(),
    );
    return {
      tops: rects.map((rect) => rect.top),
      heights: rects.map((rect) => rect.height),
    };
  }, []);

  const onPointerDown = useCallback(
    (index: number, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      draggedAt.current = null;
      press.current = { from: index, startY: event.clientY, active: false };
      try {
        // Capture so we keep receiving moves even when the pointer leaves the
        // row. This throws if the pointer is already gone by the time we get
        // here; the drag still works through normal bubbling, so a failure to
        // capture must not take the gesture — or the page — down with it.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* No active pointer to capture; proceed without it. */
      }
    },
    [],
  );

  /**
   * Recomputes the drop target from a pointer position. Shared by pointermove
   * and pointerup so a release always lands where the pointer actually is —
   * relying on the last move event would misplace the drop whenever the
   * browser coalesces or drops the final move of a fast gesture.
   */
  const track = useCallback(
    (clientY: number) => {
      const current = press.current;
      if (!current) return;

      const delta = clientY - current.startY;
      if (!current.active) {
        if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
        current.active = true;
        geometry.current = measure();
      }

      const geo = geometry.current;
      if (!geo) return;

      const height = geo.heights[current.from] ?? 0;
      const to = resolveDropTarget(current.from, delta, geo, count);

      applyDrag({ from: current.from, to, delta, height });
    },
    [applyDrag, count, measure],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!press.current) return;
      track(event.clientY);
    },
    [track],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!press.current) return;
      // Settle the target on the release position before committing.
      track(event.clientY);

      const current = press.current;
      const final = dragRef.current;
      press.current = null;
      geometry.current = null;
      applyDrag(null);
      if (current?.active) draggedAt.current = performance.now();
      if (current?.active && final && final.to !== final.from) {
        onReorder(final.from, final.to);
      }
    },
    [applyDrag, onReorder, track],
  );

  const onKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent) => {
      const direction =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (direction === 0) return;
      const to = index + direction;
      if (to < 0 || to >= count) return;
      // Stop the arrow key from also scrolling the panel.
      event.preventDefault();
      onReorder(index, to);
    },
    [count, onReorder],
  );

  /**
   * True when the click now firing is the tail of a drag that just ended, so a
   * row's click handler can ignore it. Reading clears it.
   */
  const consumeDragged = useCallback(() => {
    const at = draggedAt.current;
    draggedAt.current = null;
    // A click synthesised from the same gesture arrives within a few
    // milliseconds; anything later is a genuine, separate click.
    return at !== null && performance.now() - at < CLICK_SUPPRESSION_MS;
  }, []);

  /** Pixels this item should be shifted to visualise the pending reorder. */
  const offsetFor = useCallback(
    (index: number): number => {
      if (!drag) return 0;
      if (index === drag.from) return drag.delta;
      if (drag.to > drag.from && index > drag.from && index <= drag.to) {
        return -drag.height;
      }
      if (drag.to < drag.from && index >= drag.to && index < drag.from) {
        return drag.height;
      }
      return 0;
    },
    [drag],
  );

  return {
    setContainer,
    draggingIndex: drag?.from ?? null,
    offsetFor,
    consumeDragged,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
  };
}

export type ReorderApi = ReturnType<typeof useReorder>;
