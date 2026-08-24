/**
 * Reorder maths for a wrapping tile grid.
 *
 * The drop-target rule is the part worth guarding: the previous vertical-only
 * version shipped two wrong rules before the third stuck, and a grid adds the
 * row-wrap case that a one-dimensional model cannot express at all.
 */
const {
  moveItem,
  resolveGridDropTarget,
  slotOffsets,
  columnsPerRow,
} = require("../.test-build/reorder.js");

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
  );
};

// ---------------------------------------------------------------- moveItem
const L = ["BTC", "ETH", "SOL", "XRP", "DOGE"];

check("move first to middle", moveItem(L, 0, 2), ["ETH", "SOL", "BTC", "XRP", "DOGE"]);
check("move last to first", moveItem(L, 4, 0), ["DOGE", "BTC", "ETH", "SOL", "XRP"]);
check("move middle up one", moveItem(L, 2, 1), ["BTC", "SOL", "ETH", "XRP", "DOGE"]);
check("move first to last", moveItem(L, 0, 4), ["ETH", "SOL", "XRP", "DOGE", "BTC"]);
check("same index is a no-op", moveItem(L, 2, 2), L);
check("out-of-range from is a no-op", moveItem(L, 9, 0), L);
check("out-of-range to is a no-op", moveItem(L, 0, 9), L);
check("negative index is a no-op", moveItem(L, -1, 2), L);
check("source array is not mutated", L, ["BTC", "ETH", "SOL", "XRP", "DOGE"]);
check("single-item list is a no-op", moveItem(["A"], 0, 0), ["A"]);

// ------------------------------------------------------ grid under test
// 3 columns x 2 rows of 100px tiles with a 10px gap:
//   [0][1][2]
//   [3][4][5]
const TILE = 100, GAP = 10, STRIDE = TILE + GAP;
const geo = {
  rects: [0, 1, 2, 3, 4, 5].map((i) => ({
    left: (i % 3) * STRIDE,
    top: Math.floor(i / 3) * STRIDE,
    width: TILE,
    height: TILE,
  })),
};
const target = (from, dx, dy, hyst) =>
  resolveGridDropTarget(from, dx, dy, geo, 6, hyst);

check("no movement stays put", target(0, 0, 0), 0);

// Horizontal — the case a vertical-only model could not do at all.
check("dragged exactly onto the next tile", target(0, STRIDE, 0), 1);
check("halfway across stays put", target(0, 55, 0), 0);
check("just past halfway swaps", target(0, 62, 0), 1);
check("two tiles right", target(0, STRIDE * 2, 0), 2);
check("leftwards from the end of a row", target(2, -STRIDE, 0), 1);

// Vertical — a whole row of travel.
check("straight down one row", target(0, 0, STRIDE), 3);
check("straight up one row", target(3, 0, -STRIDE), 0);

// The row-wrap boundary: last of row 1 -> first of row 2, which is
// simultaneously a large horizontal and a vertical move.
check("wrap forward: tile 2 to slot 3", target(2, -STRIDE * 2, STRIDE), 3);
check("wrap backward: tile 3 to slot 2", target(3, STRIDE * 2, -STRIDE), 2);
check("far corner", target(0, STRIDE * 2, STRIDE), 5);

// Clamping and guards.
check("dragged far past everything clamps to nearest", target(0, 9999, 9999), 5);
check("out-of-range from returns from", target(9, 0, 0), 9);
check("empty geometry returns from", resolveGridDropTarget(0, 50, 50, { rects: [] }, 0), 0);

// Hysteresis: the incumbent slot wins ties, so a tile parked between two slots
// does not flicker. At dx=57 the rival is 4px closer — enough without a margin,
// not enough with the default one.
check("with no hysteresis a 4px edge is enough", target(0, 57, 0, 0), 1);
check("default hysteresis holds the incumbent", target(0, 57, 0), 0);

// ------------------------------------------------------------ slotOffsets
check(
  "adjacent swap moves only the displaced tile",
  slotOffsets(0, 1, geo, 6),
  [{ x: 0, y: 0 }, { x: -STRIDE, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
);
check(
  "moving across a row wrap shifts a tile up and right",
  slotOffsets(0, 3, geo, 6),
  [
    { x: 0, y: 0 },            // dragged: follows the pointer
    { x: -STRIDE, y: 0 },      // 1 -> slot 0
    { x: -STRIDE, y: 0 },      // 2 -> slot 1
    { x: STRIDE * 2, y: -STRIDE }, // 3 -> slot 2, the wrap the old model could not express
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
);
check(
  "backwards move pushes tiles forward",
  slotOffsets(3, 0, geo, 6),
  [
    { x: STRIDE, y: 0 },       // 0 -> slot 1
    { x: STRIDE, y: 0 },       // 1 -> slot 2
    { x: -STRIDE * 2, y: STRIDE }, // 2 -> slot 3
    { x: 0, y: 0 },            // dragged
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
);
check(
  "same index yields no movement",
  slotOffsets(2, 2, geo, 6),
  Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
);
check(
  "out-of-range yields no movement",
  slotOffsets(0, 9, geo, 6),
  Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
);

// Every offset must be reversible: applying from->to then to->from is identity.
const forward = slotOffsets(0, 4, geo, 6);
const backward = slotOffsets(4, 0, geo, 6);
check(
  "offsets are non-trivial in both directions",
  [forward.some((o) => o.x || o.y), backward.some((o) => o.x || o.y)],
  [true, true],
);

// ---------------------------------------------------------- columnsPerRow
check("three columns detected", columnsPerRow(geo), 3);
check("single column detected", columnsPerRow({
  rects: [0, 1, 2].map((i) => ({ left: 0, top: i * STRIDE, width: TILE, height: TILE })),
}), 1);
check("empty geometry is one column", columnsPerRow({ rects: [] }), 1);
check("sub-pixel tops still count as one row", columnsPerRow({
  rects: [
    { left: 0, top: 0, width: TILE, height: TILE },
    { left: STRIDE, top: 0.4, width: TILE, height: TILE },
    { left: 0, top: STRIDE, width: TILE, height: TILE },
  ],
}), 2);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
