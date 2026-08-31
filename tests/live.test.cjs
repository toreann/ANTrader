/**
 * Live API contract checks — run with `npm run test:live`.
 *
 * Deliberately separate from `npm test`: these hit Binance and Jupiter over the
 * network, so they are slow, need connectivity, and can fail for reasons that
 * have nothing to do with this code. Their job is to catch the venues changing
 * under us — particularly `datapi.jup.ag`, which is undocumented.
 *
 * Requires the test build: run `npm test` first, or this exits telling you so.
 */
let jup, bin;
try {
  jup = require("../.test-build/jupiter/rest.js");
  bin = require("../.test-build/binance/rest.js");
} catch {
  console.error("No test build found. Run `npm test` first.");
  process.exit(1);
}

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_DECIMALS = 9, USDC_DECIMALS = 6;

let bad = 0;
const ok = (label, cond, detail = "") => {
  if (!cond) bad++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
};

(async () => {
  // ---- Jupiter price ----
  const prices = await jup.fetchJupiterPrices([SOL]);
  const spot = prices.get(SOL)?.usdPrice;
  ok("jupiter price/v3 returns a usable price", Number.isFinite(spot), `SOL=$${spot?.toFixed(2)}`);

  // ---- Jupiter candles (the undocumented datapi host) ----
  const win = await jup.fetchJupiterWindow(SOL);
  ok("datapi charts still returns a 24h series", win && win.closes.length > 50,
     win ? `${win.closes.length} candles` : "null — datapi may have changed");
  ok("derived extremes bracket spot", win && win.low24h <= spot && spot <= win.high24h * 1.02,
     win ? `L=${win.low24h.toFixed(2)} spot=${spot.toFixed(2)} H=${win.high24h.toFixed(2)}` : "");

  // ---- Jupiter quote, cross-validated against the price endpoint ----
  const q = await jup.fetchJupiterQuote(
    SOL, USDC, jup.toBaseUnits("1", SOL_DECIMALS), 50, SOL_DECIMALS, USDC_DECIMALS);
  const drift = Math.abs(q.rate - spot) / spot;
  // This is the check that catches a decimals mix-up: a scale error shows up as
  // an enormous drift, not a subtle one.
  ok("quote rate agrees with spot within 2%", drift < 0.02,
     `rate=${q.rate.toFixed(4)} spot=${spot.toFixed(4)} drift=${(drift * 100).toFixed(3)}%`);
  ok("quote names a route", q.route.length > 0, q.route.join(" -> "));
  ok("minimum received sits just under output",
     q.minimumReceived < q.outAmount && q.minimumReceived > q.outAmount * 0.98);

  // ---- Binance, and the two venues agreeing on SOL ----
  const [binSol] = await bin.fetchTickerSnapshot(["SOLUSDT"]);
  ok("binance still serves a 24h ticker", Number.isFinite(binSol?.last), `SOLUSDT=$${binSol?.last}`);
  const venueGap = Math.abs(binSol.last - spot) / spot;
  // Independent price paths for the same asset. A large gap means one of them
  // is being read wrong, not that the market moved.
  ok("Binance and Jupiter agree on SOL within 2%", venueGap < 0.02,
     `binance=${binSol.last.toFixed(2)} jupiter=${spot.toFixed(2)} gap=${(venueGap * 100).toFixed(3)}%`);
  ok("binance publishes extremes directly",
     binSol.high24h >= binSol.low24h && binSol.high24h > 0);

  console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error("THREW:", e.message); process.exit(1); });
