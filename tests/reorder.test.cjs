/**
 * Reorder maths. The drop-target rule is the part worth guarding: it shipped
 * once comparing centre-to-centre, which made the list sit still until a full
 * row of travel.
 */
const { moveItem, resolveDropTarget } = require("../.test-build/reorder.js");

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
  );
};

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

// Five uniform 50px rows starting at y=0.
const H = 50;
const geo = {
  tops: [0, 50, 100, 150, 200],
  heights: [H, H, H, H, H],
};
const target = (from, delta) => resolveDropTarget(from, delta, geo, 5);

check("no movement stays put", target(0, 0), 0);
check("a quarter row down stays put", target(0, H * 0.25), 0);
// The regression: this MUST swap at half a row, not a full one.
check("just under half a row down stays put", target(0, H * 0.49), 0);
check("just over half a row down swaps", target(0, H * 0.51), 1);
check("1.4 rows down is still index 1", target(0, H * 1.4), 1);
check("1.6 rows down reaches index 2", target(0, H * 1.6), 2);
check("far past the end clamps to last", target(0, H * 99), 4);

check("upward: just over half a row swaps", target(4, -H * 0.51), 3);
check("upward: just under half stays put", target(4, -H * 0.49), 4);
check("far past the start clamps to first", target(4, -H * 99), 0);

// Dragging from the middle must be symmetric.
check("middle down half a row", target(2, H * 0.51), 3);
check("middle up half a row", target(2, -H * 0.51), 1);
check("middle unmoved", target(2, 0), 2);

// No oscillation: once swapped, the reverse condition must not immediately fire.
check("no oscillation just past a swap (down)", target(0, H * 0.6), 1);
check("no oscillation just past a swap (up)", target(4, -H * 0.6), 3);

// Rows of unequal height, which is what the mobile cards actually are.
const ragged = { tops: [0, 40, 140, 180], heights: [40, 100, 40, 60] };
check("ragged: tall neighbour needs more travel", resolveDropTarget(0, 30, ragged, 4), 0);
check("ragged: crossing the tall row's top edge swaps", resolveDropTarget(0, 60, ragged, 4), 1);
check("ragged: out-of-range from returns from", resolveDropTarget(9, 60, ragged, 4), 9);
check("empty geometry returns from", resolveDropTarget(0, 60, { tops: [], heights: [] }, 0), 0);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
