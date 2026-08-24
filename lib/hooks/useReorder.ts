"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  columnsPerRow,
  resolveGridDropTarget,
  slotOffsets,
  type GridGeometry,
  type Offset,
} from "@/lib/reorder";

/**
 * Drag-to-reorder for a wrapping tile grid, built on Pointer Events.
 *
 * Pointer Events rather than the HTML5 drag-and-drop API because that API does
 * not fire on touch devices at all. One pointer code path covers mouse, touch
 * and pen; arrow keys cover the rest.
 *
 * Geometry is read from the container's children rather than a ref per item,
 * which works because the grid always renders exactly one child per entry — so
 * `children[i]` is always entry `i`, placeholders included.
 */

/** Movement required before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

/** How long after a drop a click is still treated as part of that gesture. */
const CLICK_SUPPRESSION_MS = 300;

interface DragState {
  from: number;
  to: number;
  /** Live pointer displacement of the dragged tile. */
  delta: Offset;
}

/** The slice of the reorder API a single tile needs. */
export interface TileReorderProps {
  index: number;
  offset: Offset;
  dragging: boolean;
  /** True while any tile is being dragged, not just this one. */
  dragActive: boolean;
  onHandlePointerDown: (event: React.PointerEvent) => void;
  onHandlePointerMove: (event: React.PointerEvent) => void;
  onHandlePointerUp: (event: React.PointerEvent) => void;
  onHandleKeyDown: (event: React.KeyboardEvent) => void;
  /** Mouse-only drag from the tile body. */
  onBodyPointerDown: (event: React.PointerEvent) => void;
  onBodyPointerMove: (event: React.PointerEvent) => void;
  onBodyPointerUp: (event: React.PointerEvent) => void;
  /** True when the click that just fired was the tail of a drag. */
  shouldIgnoreClick: () => boolean;
}

export function useReorder(
  count: number,
  onReorder: (from: number, to: number) => void,
) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  /**
   * Callback ref rather than a ref object, so this can attach to any element
   * type without fighting TypeScript's ref variance.
   */
  const setContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
  }, []);

  // Mirrored so pointerup can read the final position without depending on the
  // render that produced it.
  const dragRef = useRef<DragState | null>(null);
  const geometry = useRef<GridGeometry | null>(null);
  const press = useRef<{
    from: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  /**
   * When the last drag finished, not merely whether one did.
   *
   * A boolean flag goes stale: a drag ending over a different element than it
   * began on produces no click to consume the flag, so the next unrelated click
   * gets swallowed. Timestamping means the suppression can only ever apply to
   * the click belonging to the gesture that just ended.
   */
  const draggedAt = useRef<number | null>(null);

  const applyDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const measure = useCallback((): GridGeometry | null => {
    const container = containerRef.current;
    if (!container) return null;
    // Measured before any transform is applied, so these are the resting slots.
    const rects = [...container.children].map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    });
    return { rects };
  }, []);

  const onPointerDown = useCallback(
    (index: number, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      draggedAt.current = null;
      press.current = {
        from: index,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
      try {
        // Capture so we keep receiving moves even when the pointer leaves the
        // tile. This throws if the pointer is already gone by the time we get
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
   * relying on the last move event would misplace the drop whenever the browser
   * coalesces or drops the final move of a fast gesture.
   */
  const track = useCallback(
    (clientX: number, clientY: number) => {
      const current = press.current;
      if (!current) return;

      const delta = {
        x: clientX - current.startX,
        y: clientY - current.startY,
      };

      if (!current.active) {
        // Either axis can start the drag: in a grid the first meaningful move
        // is just as likely to be sideways as down.
        if (Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD_PX) return;
        current.active = true;
        geometry.current = measure();
      }

      const geo = geometry.current;
      if (!geo) return;

      const to = resolveGridDropTarget(
        current.from,
        delta.x,
        delta.y,
        geo,
        count,
      );
      applyDrag({ from: current.from, to, delta });
    },
    [applyDrag, count, measure],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!press.current) return;
      track(event.clientX, event.clientY);
    },
    [track],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!press.current) return;
      // Settle the target on the release position before committing.
      track(event.clientX, event.clientY);

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
      // In a grid, left/right move by one and up/down by a whole row. The
      // column count comes from live geometry because it is a product of CSS
      // grid autoflow and is not knowable from here otherwise.
      const columns = columnsPerRow(measure() ?? { rects: [] });
      const step =
        event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowUp"
              ? -columns
              : event.key === "ArrowDown"
                ? columns
                : 0;
      if (step === 0) return;

      // Clamp rather than ignore: pressing Down on the last row should still
      // send a tile to the end instead of doing nothing.
      const to = Math.min(count - 1, Math.max(0, index + step));
      if (to === index) return;
      // Stop the arrow key from also scrolling the panel.
      event.preventDefault();
      onReorder(index, to);
    },
    [count, measure, onReorder],
  );

  /**
   * True when the click now firing is the tail of a drag that just ended, so a
   * tile's click handler can ignore it. Reading clears it.
   */
  const consumeDragged = useCallback(() => {
    const at = draggedAt.current;
    draggedAt.current = null;
    // A click synthesised from the same gesture arrives within a few
    // milliseconds; anything later is a genuine, separate click.
    return at !== null && performance.now() - at < CLICK_SUPPRESSION_MS;
  }, []);

  // Recomputed once per drag state change rather than per tile, so N tiles do
  // not each walk the whole list.
  const offsets = useMemo<Offset[]>(() => {
    if (!drag || !geometry.current) return [];
    return slotOffsets(drag.from, drag.to, geometry.current, count);
  }, [drag, count]);

  const offsetFor = useCallback(
    (index: number): Offset => {
      if (!drag) return { x: 0, y: 0 };
      if (index === drag.from) return drag.delta;
      return offsets[index] ?? { x: 0, y: 0 };
    },
    [drag, offsets],
  );

  /** Adapts the grid-wide API to what one tile needs. */
  const tileProps = useCallback(
    (index: number): TileReorderProps => ({
      index,
      offset: offsetFor(index),
      dragging: drag?.from === index,
      dragActive: drag !== null,
      onHandlePointerDown: (event) => {
        // Stop the press from also being handled by the tile body.
        event.stopPropagation();
        onPointerDown(index, event);
      },
      onHandlePointerMove: onPointerMove,
      onHandlePointerUp: onPointerUp,
      onHandleKeyDown: (event) => onKeyDown(index, event),
      onBodyPointerDown: (event) => {
        // Touch drags start only from the grip: making the body draggable on
        // touch would need `touch-action: none`, which would stop the grid
        // scrolling on a phone.
        if (event.pointerType !== "mouse") return;
        onPointerDown(index, event);
      },
      onBodyPointerMove: onPointerMove,
      onBodyPointerUp: onPointerUp,
      shouldIgnoreClick: consumeDragged,
    }),
    [
      consumeDragged,
      drag,
      offsetFor,
      onKeyDown,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    ],
  );

  return {
    setContainer,
    draggingIndex: drag?.from ?? null,
    tileProps,
  };
}

export type ReorderApi = ReturnType<typeof useReorder>;
