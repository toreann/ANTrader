/**
 * Exercises the number-presentation rules against the real implementations.
 *
 * The tickSize cases are the exact values Binance returns from exchangeInfo for
 * those pairs, so a regression here means small-cap prices silently lose digits.
 */
const { decimalsFromTickSize } = require("../.test-build/binance/rest.js");
const {
  formatPrice,
  formatChange,
  formatPercent,
  formatVolume,
  rangePosition,
} = require("../.test-build/format.js");

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
  );
};

// Real tickSize values from GET /exchangeInfo.
check("BTCUSDT tickSize 0.01 -> 2dp", decimalsFromTickSize("0.01000000"), 2);
check("DOGEUSDT tickSize 0.00001 -> 5dp", decimalsFromTickSize("0.00001000"), 5);
check("tickSize 0.10000000 -> 1dp", decimalsFromTickSize("0.10000000"), 1);
check("tickSize 1.00000000 -> 0dp", decimalsFromTickSize("1.00000000"), 0);
check("tickSize 10.00000000 -> 0dp", decimalsFromTickSize("10.00000000"), 0);
check("tickSize without a dot -> 0dp", decimalsFromTickSize("100"), 0);
check("tickSize 0.00000001 -> 8dp", decimalsFromTickSize("0.00000001"), 8);

// Precision must follow the pair, not a constant.
check("BTC price keeps 2dp", formatPrice(77080, 2), "77,080.00");
check("DOGE price keeps 5dp", formatPrice(0.08425, 5), "0.08425");
check("non-finite price degrades to a dash", formatPrice(NaN, 2), "—");

check("positive change is signed", formatChange(4656.01, 2), "+4,656.01");
check("negative change uses a minus sign", formatChange(-12.5, 2), "−12.50");
check("zero change is unsigned", formatChange(0, 2), "0.00");

check("percent is signed and 2dp", formatPercent(6.429), "+6.43%");
check("negative percent", formatPercent(-0.5), "−0.50%");

check("volume compacts to billions", formatVolume(3219691654.03), "3.22B");
check("volume compacts to millions", formatVolume(477_240_000), "477.24M");
check("zero volume degrades to a dash", formatVolume(0), "—");

// Real BTC figures: low 72205.88, high 79500, last 77080.
const pos = rangePosition(77080, 72205.88, 79500);
check("real BTC sits ~66.8% up its 24h range", Math.round(pos * 1000) / 10, 66.8);
check("a flat range sits in the middle", rangePosition(5, 5, 5), 0.5);
check("below the low clamps to 0", rangePosition(-5, 0, 10), 0);
check("above the high clamps to 1", rangePosition(50, 0, 10), 1);
check("non-finite range is null", rangePosition(NaN, 0, 10), null);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
