/**
 * Market-search ranking. Binance has no search endpoint and Jupiter's own order
 * is mostly by liquidity, so relevance is decided here — and both rankings
 * shipped wrong once.
 */
const { rankBinanceSymbols } = require("../.test-build/binance/rest.js");
const { rankJupiterTokens } = require("../.test-build/jupiter/rest.js");

let bad = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) bad++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
  );
};
const first = (arr) => (arr.length ? arr[0] : null);

// ---------------------------------------------------------------- Binance
// A realistic slice of the ~3.7k symbol universe, including the noise.
const UNIVERSE = [
  "BTCUSDT", "BTCUSDC", "BTCFDUSD", "BTCEUR", "BTCUPUSDT", "BTCDOWNUSDT",
  "BTCSTUSDT", "WBTCUSDT", "ETHUSDT", "ETHBULLUSDT", "ETHBEARUSDT",
  "SOLUSDT", "SOLUSDC", "SOLVUSDT", "DOGEUSDT", "DOGEEUR", "JUPUSDT",
];

check("the major pair wins", first(rankBinanceSymbols(UNIVERSE, "BTC")), "BTCUSDT");
check("query is case-insensitive", first(rankBinanceSymbols(UNIVERSE, "btc")), "BTCUSDT");
check("an exact symbol wins outright", first(rankBinanceSymbols(UNIVERSE, "BTCUSDC")), "BTCUSDC");
check("SOL beats the SOLV look-alike", first(rankBinanceSymbols(UNIVERSE, "SOL")), "SOLUSDT");
// Leveraged tokens are largely dead products; without volume data they would
// otherwise fill every result for a major.
const btc = rankBinanceSymbols(UNIVERSE, "BTC", 4);
check("no leveraged token in the top 4", btc.some((s) => /(?:UP|DOWN|BULL|BEAR)USDT$/.test(s)), false);
// Compared over the whole ranking: in a limited slice BTCEUR is absent, and
// indexOf(-1) would make a correct ranking look like a failure.
const btcAll = rankBinanceSymbols(UNIVERSE, "BTC", 99);
check("USDT is preferred over EUR",
  btcAll.indexOf("BTCUSDT") < btcAll.indexOf("BTCEUR"), true);
check("stablecoin quotes outrank fiat ones",
  btcAll.indexOf("BTCUSDC") < btcAll.indexOf("BTCEUR"), true);
check("ETH avoids BULL/BEAR", first(rankBinanceSymbols(UNIVERSE, "ETH")), "ETHUSDT");
check("limit is respected", rankBinanceSymbols(UNIVERSE, "BTC", 2).length, 2);
check("no match yields nothing", rankBinanceSymbols(UNIVERSE, "ZZZZ"), []);
check("empty query yields nothing", rankBinanceSymbols(UNIVERSE, "  "), []);
check("substring matches, not just prefix", rankBinanceSymbols(UNIVERSE, "WBTC"), ["WBTCUSDT"]);

// ---------------------------------------------------------------- Jupiter
const t = (symbol, isVerified, liquidity) => ({ symbol, isVerified, liquidity, id: symbol });

// The exact shape that made this dangerous: four unverified tokens literally
// named "BTC" alongside the legitimate wrapped ones.
const BTC_IMPOSTORS = [
  t("WBTC", true, 35_000_000),
  t("BTC", false, 900_000),
  t("BTC", false, 400_000),
  t("cbBTC", true, 25_000_000),
  t("BTC", false, 100_000),
];
const ranked = rankJupiterTokens(BTC_IMPOSTORS, "BTC");
check("a verified token outranks an exact-match impostor", ranked[0].symbol, "WBTC");
check("every verified token precedes every unverified one",
  ranked.findIndex((x) => !x.isVerified) > ranked.map((x) => x.isVerified).lastIndexOf(true), true);
check("impostors are not removed, only demoted", ranked.filter((x) => !x.isVerified).length, 3);

// Relevance within the verified tier: the searched token, not its derivatives.
const SOL_SET = [
  t("BNSOL", true, 978_000_000),
  t("JitoSOL", true, 966_000_000),
  t("SOL", true, 766_000_000),
  t("JupSOL", true, 497_000_000),
];
check("the exact symbol beats higher-liquidity derivatives",
  rankJupiterTokens(SOL_SET, "SOL")[0].symbol, "SOL");
check("liquidity still orders the rest",
  rankJupiterTokens(SOL_SET, "SOL").slice(1).map((x) => x.symbol),
  ["BNSOL", "JitoSOL", "JupSOL"]);

// Prefix beats unrelated, and relevance is case-insensitive.
const MIX = [t("zzz", true, 5), t("JUPCAT", true, 1), t("JUP", true, 0)];
check("exact, then prefix, then the rest",
  rankJupiterTokens(MIX, "jup").map((x) => x.symbol), ["JUP", "JUPCAT", "zzz"]);
check("missing fields do not throw",
  rankJupiterTokens([{ id: "x" }, t("SOL", true, 1)], "SOL")[0].symbol, "SOL");
check("input array is not mutated", SOL_SET[0].symbol, "BNSOL");

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
