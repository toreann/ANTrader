/**
 * Deterministic Jupiter helpers. No network — the live API contract is checked
 * separately by `npm run test:live`.
 *
 * The base-unit conversion is the load-bearing one: a quote that is right in
 * shape but wrong by orders of magnitude is the most dangerous output this app
 * can produce, and it shipped once when display precision was passed where a
 * token's on-chain decimals were required.
 */
const { toBaseUnits, usdPriceDecimals } = require("../.test-build/jupiter/rest.js");
const { parseEntry, parseEntries, serializeEntries, entryKey } =
  require("../.test-build/watchlist.js");

let bad = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) bad++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
  );
};

// ---------------------------------------------------------- toBaseUnits
check("1 SOL at 9 decimals", toBaseUnits("1", 9), "1000000000");
check("1 USDC at 6 decimals", toBaseUnits("1", 6), "1000000");
check("fractional amount", toBaseUnits("1.5", 9), "1500000000");
check("leading dot", toBaseUnits("0.25", 6), "250000");
check("zero decimals token", toBaseUnits("7", 0), "7");
check("excess precision truncates, never rounds up", toBaseUnits("1.9999999", 2), "199");
check("trailing zeros preserved in scale", toBaseUnits("2.10", 6), "2100000");
check("zero", toBaseUnits("0", 9), "0");
check("rejects letters", toBaseUnits("abc", 9), null);
check("rejects a bare dot", toBaseUnits(".", 9), null);
check("rejects negatives", toBaseUnits("-1", 9), null);
check("rejects double dots", toBaseUnits("1.2.3", 9), null);
// The exact shipped bug, pinned: display precision must not be mistaken for
// on-chain decimals, and the difference has to be enormous and obvious.
const correct = Number(toBaseUnits("1", 9));
const buggy = Number(toBaseUnits("1", 4));
check("display precision vs on-chain decimals differ by 1e5", correct / buggy, 100000);

// ------------------------------------------------------ usdPriceDecimals
check("four figures -> 2dp", usdPriceDecimals(79680), 2);
check("dollars -> 4dp", usdPriceDecimals(97.19), 4);
check("cents -> 5dp", usdPriceDecimals(0.213), 5);
check("sub-cent -> 7dp", usdPriceDecimals(0.00042), 7);
check("dust -> 9dp", usdPriceDecimals(0.0000001), 9);
check("nonsense falls back", usdPriceDecimals(NaN), 4);

// ------------------------------------------------------------ watchlist
check("binance entry parses", parseEntry("binance:BTCUSDT"), { source: "binance", id: "BTCUSDT" });
check("binance symbol is upper-cased", parseEntry("binance:btcusdt"), { source: "binance", id: "BTCUSDT" });
// Mint addresses are base58 and case-sensitive — upper-casing corrupts them.
check("mint case is preserved", parseEntry("jupiter:So11111111111111111111111111111111111111112"),
      { source: "jupiter", id: "So11111111111111111111111111111111111111112" });
check("legacy bare symbol reads as binance", parseEntry("ETHUSDT"), { source: "binance", id: "ETHUSDT" });
check("unknown venue is rejected", parseEntry("kraken:XBTUSD"), null);
check("empty id is rejected", parseEntry("binance:"), null);
check("a legacy array migrates whole", parseEntries(["BTCUSDT", "jupiter:abc"]),
      [{ source: "binance", id: "BTCUSDT" }, { source: "jupiter", id: "abc" }]);
check("junk entries are dropped, not fatal", parseEntries(["BTCUSDT", 42, null, "kraken:x"]),
      [{ source: "binance", id: "BTCUSDT" }]);
check("non-array yields nothing", parseEntries("nope"), []);
check("round-trips through storage",
      parseEntries(serializeEntries([{ source: "jupiter", id: "Abc123" }, { source: "binance", id: "SOLUSDT" }])),
      [{ source: "jupiter", id: "Abc123" }, { source: "binance", id: "SOLUSDT" }]);
// Two venues can list the same ticker; keys must never collide.
check("venue-qualified keys cannot collide",
      entryKey({ source: "binance", id: "SOL" }) !== entryKey({ source: "jupiter", id: "SOL" }), true);

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
