"use client";

import { useEffect, useRef } from "react";

/** Tick wash, tuned to read as a pulse rather than a highlight block. */
const FLASH_UP = "rgba(38, 208, 124, 0.22)";
const FLASH_DOWN = "rgba(246, 70, 93, 0.22)";
const DURATION_MS = 500;

/**
 * Flashes an element green or red whenever `value` moves.
 *
 * Driven imperatively rather than by a CSS class keyed on tick count: restarting
 * a CSS animation requires remounting the node, and a node replaced ten times a
 * second cannot be reliably clicked or selected — mousedown and mouseup would
 * land on different elements.
 *
 * Shared by the desktop row and the mobile card so both flash identically from
 * one implementation.
 */
export function usePriceFlash<T extends HTMLElement>(value: number) {
  const ref = useRef<T | null>(null);
  const previous = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === null || before === value) return;

    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    animation.current?.cancel();
    animation.current = element.animate(
      [
        { backgroundColor: value > before ? FLASH_UP : FLASH_DOWN },
        { backgroundColor: "transparent" },
      ],
      { duration: DURATION_MS, easing: "ease-out" },
    );
  }, [value]);

  return ref;
}
