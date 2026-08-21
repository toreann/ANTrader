/**
 * Drives BinanceSocket against a controllable fake WebSocket so the reconnect
 * path can be asserted deterministically instead of by unplugging a cable.
 */
const instances = [];
class FakeWS {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url) {
    this.url = url; this.readyState = 0; this.sent = [];
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    instances.push(this);
  }
  send(d) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; }
  // test helpers
  fireOpen() { this.readyState = 1; this.onopen?.(); }
  fireMessage(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  fireClose() { this.readyState = 3; this.onclose?.(); }
}
globalThis.WebSocket = FakeWS;

const { BinanceSocket } = require("../.test-build/binance/socket.js");

const log = [];
let tickers = 0, klines = 0, connects = 0;
const sock = new BinanceSocket({
  onTicker: () => { tickers++; },
  onKline: () => { klines++; },
  onStatus: (s) => log.push(`status:${s}`),
  onConnected: () => { connects++; log.push("connected"); },
});

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}` + (ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`));
};

(async () => {
  // 1. First sync opens exactly one connection.
  sock.sync(["btcusdt@ticker", "ethusdt@ticker"]);
  check("one socket after first sync", instances.length, 1);
  check("status went to connecting", log.includes("status:connecting"), true);
  check("initial URL carries both streams",
    instances[0].url, "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker");

  // 2. Opening reports live and asks the caller to re-snapshot.
  instances[0].fireOpen();
  check("status live on open", log.includes("status:live"), true);
  check("onConnected fired once", connects, 1);

  // 3. Repeated sync with an identical set is a no-op.
  sock.sync(["btcusdt@ticker", "ethusdt@ticker"]);
  check("identical sync sends nothing", instances[0].sent.length, 0);
  check("identical sync opens no socket", instances.length, 1);

  // 4. Changing the set reconciles in place — no new connection.
  sock.sync(["btcusdt@ticker", "btcusdt@kline_1m"]);
  check("reconcile stays on one socket", instances.length, 1);
  check("reconcile sent UNSUBSCRIBE then SUBSCRIBE",
    instances[0].sent.map((m) => [m.method, m.params]),
    [["UNSUBSCRIBE", ["ethusdt@ticker"]], ["SUBSCRIBE", ["btcusdt@kline_1m"]]]);

  // 5. Routing: real events dispatch, subscribe acks are ignored.
  instances[0].fireMessage({ result: null, id: 1 });
  instances[0].fireMessage({ stream: "btcusdt@ticker", data: { e: "24hrTicker", s: "BTCUSDT", c: "1" } });
  instances[0].fireMessage({ stream: "btcusdt@kline_1m", data: { e: "kline", s: "BTCUSDT", k: { t: 0 } } });
  instances[0].fireMessage("not json at all");
  check("acks and garbage ignored, events routed", [tickers, klines], [1, 1]);

  // 6. An unexpected close reconnects, and reconnect carries the CURRENT set.
  instances[0].fireClose();
  check("status reconnecting after drop", log.at(-1), "status:reconnecting");
  check("no immediate reconnect (backoff first)", instances.length, 1);
  await new Promise((r) => setTimeout(r, 1200)); // first backoff is 0.5–1.0s
  check("reconnected after backoff", instances.length, 2);
  check("reconnect URL uses the reconciled set",
    instances[1].url, "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@kline_1m");
  instances[1].fireOpen();
  check("re-snapshot requested on reconnect", connects, 2);

  // 7. sync() while down must not send on a dead socket; it lands on next connect.
  instances[1].fireClose();
  sock.sync(["solusdt@ticker"]);
  check("no send while disconnected", instances[1].sent.length, 0);
  await new Promise((r) => setTimeout(r, 1600));
  check("next connect uses the newest set",
    instances.at(-1).url, "wss://stream.binance.com:9443/stream?streams=solusdt@ticker");

  // 8. dispose() must stop everything, including a pending retry.
  const countAtDispose = instances.length;
  instances.at(-1).fireClose();
  sock.dispose();
  await new Promise((r) => setTimeout(r, 2500));
  check("no reconnect after dispose", instances.length, countAtDispose);
  sock.sync(["btcusdt@ticker"]);
  check("sync after dispose is inert", instances.length, countAtDispose);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
