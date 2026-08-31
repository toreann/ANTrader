/**
 * Square-chart sizing. The chart occupies an N x N block of square grid cells,
 * so its size is an integer — anything yielding a fraction or drifting out of
 * range breaks the squareness the layout depends on.
 */
const {
  clampSpan, spanFromPointer, sizeFromPointer, sizeForSpan,
  MIN_SPAN, MAX_SPAN, DEFAULT_SPAN,
} = require("../.test-build/chartSpan.js");

let bad = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) bad++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
  );
};

// ------------------------------------------------------------- clampSpan
check("bounds are 2..4 with a default of 3", [MIN_SPAN, MAX_SPAN, DEFAULT_SPAN], [2, 4, 3]);
check("in-range passes through", clampSpan(3), 3);
check("below the floor clamps up", clampSpan(1), 2);
check("above the ceiling clamps down", clampSpan(9), 4);
check("fractions round down below the midpoint", clampSpan(2.4), 2);
check("fractions round up past the midpoint", clampSpan(2.6), 3);
check("NaN falls back to the default", clampSpan(NaN), 3);
check("Infinity clamps to the ceiling", clampSpan(Infinity), 4);
check("-Infinity clamps to the floor", clampSpan(-Infinity), 2);
check("every result is an integer",
  [1, 2.5, 3, 99, NaN, Infinity].map((v) => clampSpan(v)).every(Number.isInteger), true);

// --------------------------------------------------------- spanFromPointer
// A 6-column grid of 238px cells with an 8px gap, matching the real layout.
const CELL = 238, GAP = 8, STRIDE = CELL + GAP;
const RIGHT = 1000, TOP = 100;
// Exact left edge of a chart of span N, pinned to RIGHT.
const leftFor = (n) => RIGHT - (n * CELL + (n - 1) * GAP);
const at = (x, y) => spanFromPointer({
  pointerX: x, pointerY: y, right: RIGHT, top: TOP, cell: CELL, gap: GAP,
});

check("pointer on a 2-span left edge gives 2", at(leftFor(2), TOP), 2);
check("pointer on a 3-span left edge gives 3", at(leftFor(3), TOP), 3);
check("pointer on a 4-span left edge gives 4", at(leftFor(4), TOP), 4);
// Snapping: anywhere within half a cell of an edge resolves to that span.
check("just inside a 3-span edge still snaps to 3", at(leftFor(3) + 40, TOP), 3);
check("just outside a 3-span edge still snaps to 3", at(leftFor(3) - 40, TOP), 3);
check("past the midpoint snaps to the next span up", at(leftFor(3) - 160, TOP), 4);

// Dragging straight DOWN must grow it too — the corner moves in both axes.
check("dragging down two strides gives 2", at(RIGHT, TOP + 2 * STRIDE - GAP), 2);
check("dragging down three strides gives 3", at(RIGHT, TOP + 3 * STRIDE - GAP), 3);
// Whichever axis is pulled further wins, so a sloppy diagonal still works.
check("the larger axis wins", at(leftFor(2), TOP + 4 * STRIDE), 4);

// Clamping at the extremes.
check("dragged far left clamps to the max", at(-9999, TOP), 4);
check("dragged right of the anchor clamps to the min", at(RIGHT + 500, TOP), 2);
check("dragged above the anchor clamps to the min", at(RIGHT, TOP - 500), 2);

// Degenerate geometry must not produce NaN spans.
check("a zero cell size falls back to the min",
  spanFromPointer({ pointerX: 0, pointerY: 0, right: RIGHT, top: TOP, cell: 0, gap: 0 }), 2);
check("a NaN cell size falls back to the min",
  spanFromPointer({ pointerX: 0, pointerY: 0, right: RIGHT, top: TOP, cell: NaN, gap: GAP }), 2);
// The gap term is easy to forget; without it larger spans lag a cell behind.
check("the gap is accounted for at the largest span",
  spanFromPointer({ pointerX: leftFor(4), pointerY: TOP, right: RIGHT, top: TOP,
                    cell: CELL, gap: GAP, min: 2, max: 6 }), 4);

// ------------------------------------------------- sizeForSpan / preview
// A span of N is N*cell + (N-1)*gap across.
check("a 2-span is two cells plus one gap", sizeForSpan(2, CELL, GAP), 2 * CELL + GAP);
check("a 4-span is four cells plus three gaps", sizeForSpan(4, CELL, GAP), 4 * CELL + 3 * GAP);
check("sizeForSpan inverts spanFromPointer",
  at(RIGHT - sizeForSpan(3, CELL, GAP), TOP), 3);

// The preview is deliberately UNsnapped: without it there is a whole cell of
// pointer travel where nothing moves, which is what felt broken.
const size = (x, y) => sizeFromPointer({
  pointerX: x, pointerY: y, right: RIGHT, top: TOP, cell: CELL, gap: GAP,
});
check("preview tracks the pointer exactly", size(RIGHT - 600, TOP), 600);
check("preview tracks a different position exactly", size(RIGHT - 703, TOP), 703);
check("preview is continuous between snap points",
  [size(RIGHT - 600, TOP), size(RIGHT - 610, TOP), size(RIGHT - 620, TOP)],
  [600, 610, 620]);
check("preview follows the vertical axis too", size(RIGHT, TOP + 640), 640);
check("preview takes whichever axis is pulled further", size(RIGHT - 300, TOP + 700), 700);
// It must still respect the bounds the commit will apply.
check("preview cannot shrink below the min span",
  size(RIGHT + 999, TOP), sizeForSpan(MIN_SPAN, CELL, GAP));
check("preview cannot grow beyond the max span",
  size(-9999, TOP), sizeForSpan(MAX_SPAN, CELL, GAP));
check("a non-finite pointer falls back to the min span",
  size(NaN, NaN), sizeForSpan(MIN_SPAN, CELL, GAP));
// The preview and the committed span must agree at the snap point, or the
// outline would promise one size and the layout deliver another.
check("preview and commit agree at a snap point",
  [size(RIGHT - sizeForSpan(3, CELL, GAP), TOP), sizeForSpan(at(RIGHT - sizeForSpan(3, CELL, GAP), TOP), CELL, GAP)],
  [sizeForSpan(3, CELL, GAP), sizeForSpan(3, CELL, GAP)]);

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
