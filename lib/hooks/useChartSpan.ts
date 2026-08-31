"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampSpan,
  DEFAULT_SPAN,
  MAX_SPAN,
  MIN_SPAN,
  sizeFromPointer,
  spanFromPointer,
} from "@/lib/chartSpan";

/**
 * How many grid cells the square chart spans, persisted.
 *
 * Adjustable two ways, on purpose. Dragging the chart's bottom-left corner is
 * the direct gesture; the stepper is the precise and keyboard-reachable one, and
 * the only comfortable option on a phone where grabbing a corner is fiddly.
 *
 * Either way the committed value is a whole number of cells — that is what keeps
 * the chart square without measuring it.
 */

const STORAGE_KEY = "antrader.chartSpan.v1";

interface DragGeometry {
  /** The grid the chart is placed in, for its edges and cell size. */
  grid: HTMLElement | null;
  /** Any tile, to read one cell's side length. */
  cell: HTMLElement | null;
}

export function useChartSpan(
  initial: number = DEFAULT_SPAN,
  /** Called just before a committed change, so the caller can FLIP the reflow. */
  beforeCommit?: () => void,
) {
  const [span, setSpan] = useState(clampSpan(initial));
  const [dragging, setDragging] = useState(false);
  /**
   * Unsnapped side length while dragging, for the preview outline.
   *
   * The grid is not reflowed per frame — only this overlay follows the pointer,
   * and the real span is committed once on release. That is what keeps the
   * gesture continuous without thrashing layout or re-rendering the canvas.
   */
  const [preview, setPreview] = useState<{ size: number; span: number } | null>(
    null,
  );

  /**
   * Mirrors `span` but updates synchronously.
   *
   * Without it, two clicks on the same button inside one tick both read the same
   * pre-update value from their closure and commit the same result — pressing +
   * twice quickly moved the chart one step instead of two.
   */
  const spanRef = useRef(span);
  const geometry = useRef<DragGeometry>({ grid: null, cell: null });
  const pressed = useRef(false);

  // Read after mount, never during render: touching localStorage while
  // rendering desyncs the server and client HTML.
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (stored) {
        const value = clampSpan(stored);
        spanRef.current = value;
        setSpan(value);
      }
    } catch {
      /* Private browsing: keep the default. */
    }
  }, []);

  const commit = useCallback((next: number, persist = true) => {
    const value = clampSpan(next);
    if (value !== spanRef.current) beforeCommit?.();
    spanRef.current = value;
    setSpan(value);
    if (!persist) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  }, [beforeCommit]);

  const grow = useCallback(() => commit(spanRef.current + 1), [commit]);
  const shrink = useCallback(() => commit(spanRef.current - 1), [commit]);

  /** Called with the elements the drag needs to measure against. */
  const setGeometry = useCallback((next: DragGeometry) => {
    geometry.current = next;
  }, []);

  const track = useCallback(
    (clientX: number, clientY: number, release: boolean) => {
      const { grid, cell } = geometry.current;
      if (!grid || !cell) return;
      const gridRect = grid.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
      const args = {
        pointerX: clientX,
        pointerY: clientY,
        // The chart is anchored to the grid's top-right corner.
        right: gridRect.right,
        top: gridRect.top,
        cell: cellRect.width,
        gap,
        min: MIN_SPAN,
        max: MAX_SPAN,
      };

      if (release) {
        setPreview(null);
        commit(spanFromPointer(args), true);
        return;
      }
      // Mid-drag: move the outline only. The grid keeps its current layout, so
      // there is no per-frame reflow and no canvas re-render.
      setPreview({
        size: sizeFromPointer(args),
        span: spanFromPointer(args),
      });
    },
    [commit],
  );

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    pressed.current = true;
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* No active pointer to capture; the drag still works by bubbling. */
    }
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!pressed.current) return;
      // Otherwise the drag selects the surrounding text.
      event.preventDefault();
      // Not persisted mid-drag: writing to localStorage on every pointer move
      // is pointless churn when only the released value matters.
      track(event.clientX, event.clientY, false);
    },
    [track],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!pressed.current) return;
      pressed.current = false;
      setDragging(false);
      // Settle on the release position, so a coalesced final move cannot leave
      // the chart a cell away from where the pointer was let go.
      track(event.clientX, event.clientY, true);
    },
    [track],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const bigger =
        event.key === "ArrowLeft" || event.key === "ArrowDown" ? 1 : 0;
      const smaller =
        event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
      if (!bigger && !smaller) return;
      event.preventDefault();
      commit(spanRef.current + bigger - smaller);
    },
    [commit],
  );

  return {
    span,
    dragging,
    preview,
    grow,
    shrink,
    canGrow: span < MAX_SPAN,
    canShrink: span > MIN_SPAN,
    min: MIN_SPAN,
    max: MAX_SPAN,
    setGeometry,
    reset: useCallback(() => commit(DEFAULT_SPAN), [commit]),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown },
  };
}
