"use client";

import { memo, useId } from "react";

interface SparklineProps {
  /** Closing prices oldest-to-newest. The final entry is the in-progress candle. */
  closes: number[] | undefined;
  /** Live last price, which replaces the in-progress candle's close. */
  live: number;
  /** Direction over the window, used only for colour. */
  positive: boolean;
  label: string;
}

// Drawn in an abstract 100x28 box and stretched to whatever the cell allows.
const VIEW_W = 100;
const VIEW_H = 28;
const PAD_Y = 3;

const UP = "#26d07c";
const DOWN = "#f6465d";

function SparklineImpl({ closes, live, positive, label }: SparklineProps) {
  // Gradient ids must be unique per instance: several of these render at once,
  // and duplicate ids in one document are invalid markup that resolves by
  // document order rather than by the element that declared it.
  const gradientId = useId();

  if (!closes || closes.length < 2) {
    // Still loading: a dim rule, so the column does not jump when data lands.
    return (
      <div
        className="h-[28px] w-full min-w-16"
        role="img"
        aria-label={`${label} — trend loading`}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          <line
            x1="0"
            y1={VIEW_H / 2}
            x2={VIEW_W}
            y2={VIEW_H / 2}
            stroke="currentColor"
            className="text-term-border"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  }

  // The last historical candle is still open, so its close is stale by up to
  // half an hour — the live price is the truthful tip.
  const series = [...closes.slice(0, -1), live];

  let min = Infinity;
  let max = -Infinity;
  for (const value of series) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  // A perfectly flat series would divide by zero; draw it down the middle.
  const span = max - min || 1;

  const stepX = VIEW_W / (series.length - 1);
  const toY = (value: number) =>
    VIEW_H - PAD_Y - ((value - min) / span) * (VIEW_H - PAD_Y * 2);

  const points = series.map((value, index) => `${index * stepX},${toY(value)}`);
  const line = `M${points.join(" L")}`;
  // Same path closed down to the baseline, for a faint fill under the curve.
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;

  const colour = positive ? UP : DOWN;
  // Where the live price sits between the window's extremes. This is the same
  // reading the standalone range bar gives, which is why the table no longer
  // needs a separate column for it.
  const tipPercent = (toY(live) / VIEW_H) * 100;

  return (
    <div className="relative h-[28px] w-full min-w-16">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.22" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke={colour}
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          // Keeps the stroke an even weight despite the non-uniform stretch
          // applied by preserveAspectRatio="none".
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* An HTML dot rather than an SVG circle: the non-uniform stretch above
          would squash a circle into an ellipse. */}
      <span
        aria-hidden
        className="absolute size-[5px] rounded-full ring-2 ring-term-panel"
        style={{
          left: "100%",
          top: `${tipPercent}%`,
          backgroundColor: colour,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

export const Sparkline = memo(SparklineImpl);
