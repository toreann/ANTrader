"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * FLIP-animates a grid's children between layouts.
 *
 * A grid item's size comes from its track sizing, which is not a transitionable
 * property — so changing the chart's span jumps instantly no matter what CSS
 * transition is declared. The way around that is to measure before and after,
 * then animate the *difference* as a transform, which the compositor can
 * interpolate.
 *
 * Transforms also mean the reflow itself happens once, immediately: the grid is
 * already in its final state while the animation plays catch-up. Nothing is
 * re-laid-out per frame.
 */

const DURATION_MS = 260;
/** Ease-out: quick to leave, settles gently. */
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Sub-pixel deltas are not worth an animation. */
const EPSILON = 0.5;

export function useGridFlip(
  container: React.RefObject<HTMLElement | null>,
  /** Change this to trigger the animation after a re-render. */
  key: unknown,
) {
  const before = useRef<Map<Element, DOMRect> | null>(null);
  const running = useRef<Animation[]>([]);

  /** Record current positions. Call immediately before committing a change. */
  const capture = useCallback(() => {
    const element = container.current;
    if (!element) return;
    const map = new Map<Element, DOMRect>();
    for (const child of element.children) {
      map.set(child, child.getBoundingClientRect());
    }
    before.current = map;
  }, [container]);

  useLayoutEffect(() => {
    const element = container.current;
    const previous = before.current;
    before.current = null;
    if (!element || !previous) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Cancel in-flight animations first: a second change mid-flight would
    // otherwise measure a transformed rect and compound the offset.
    for (const animation of running.current) animation.cancel();
    running.current = [];

    for (const child of element.children) {
      const from = previous.get(child);
      if (!from) continue;
      const to = child.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      const sx = to.width > 0 ? from.width / to.width : 1;
      const sy = to.height > 0 ? from.height / to.height : 1;
      const moved = Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON;
      const resized =
        Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001;
      if (!moved && !resized) continue;

      running.current.push(
        (child as HTMLElement).animate(
          [
            {
              transformOrigin: "top left",
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            },
            { transformOrigin: "top left", transform: "none" },
          ],
          { duration: DURATION_MS, easing: EASING },
        ),
      );
    }
  }, [container, key]);

  return { capture };
}
