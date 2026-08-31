"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies a token's contract (mint) address.
 *
 * Only meaningful for on-chain markets: a Binance pair is an exchange symbol,
 * not an address, so the caller renders this only when a mint exists.
 *
 * The full address is in the tooltip as well as the clipboard, because a mint is
 * 44 characters of base58 and the one thing worse than not copying it is copying
 * the wrong one.
 */

/** How long the outcome stays on screen before returning to the idle icon. */
const FEEDBACK_MS = 1400;

type State = "idle" | "copied" | "failed";

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    // Requires a secure context; localhost counts, plain http on a LAN does not.
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the legacy path. */
  }
  try {
    // Deprecated, but it is the only thing that works without the async
    // clipboard API — and failing silently would be worse than using it.
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:-9999px;opacity:0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyContractButton({
  address,
  label,
}: {
  address: string;
  /** Market name, for a self-describing accessible label. */
  label: string;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (event: React.MouseEvent) => {
      // Copying must not also select the tile it lives in.
      event.stopPropagation();
      const ok = await writeToClipboard(address);
      setState(ok ? "copied" : "failed");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
    },
    [address],
  );

  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  const title =
    state === "copied"
      ? "Contract address copied"
      : state === "failed"
        ? "Could not copy — the clipboard was refused"
        : `Copy contract address\n${address}`;

  return (
    <button
      type="button"
      onClick={copy}
      // Stops the tile treating this press as the start of a drag.
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={`Copy ${label} contract address ${short}`}
      title={title}
      // 24x24 hit area around a 12px glyph: WCAG 2.5.8's minimum target size.
      // The icon stays small so the row does not gain visual weight.
      className={`grid size-6 shrink-0 place-items-center rounded transition-colors ${
        state === "copied"
          ? "text-term-up"
          : state === "failed"
            ? "text-term-down"
            : "text-term-dim hover:bg-term-border hover:text-term-text"
      }`}
    >
      {/* Announced separately from the icon, so the outcome reaches a screen
          reader rather than only being a colour change. */}
      <span className="sr-only" role="status">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed"
            : ""}
      </span>
      <svg
        viewBox="0 0 12 12"
        aria-hidden
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {state === "copied" ? (
          <path d="M2.5 6.5 L4.75 9 L9.5 3.5" />
        ) : state === "failed" ? (
          <path d="M3 3 L9 9 M9 3 L3 9" />
        ) : (
          <>
            <rect x="4.25" y="4.25" width="5.25" height="5.25" rx="1" />
            <path d="M7.75 2.5 H3.5 A1 1 0 0 0 2.5 3.5 V7.75" />
          </>
        )}
      </svg>
    </button>
  );
}
