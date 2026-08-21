# ANTrader

A crypto spot terminal. Real-time prices with the day's high, low and a 24h
trend line per pair; click any row to open it as candlesticks, or drag it by the
grip to reorder your watchlist.

This is **v1**, scoped deliberately narrow: a price dashboard that works
end-to-end. Alerts and on-chain data are later phases.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (prerenders to fully static output) |
| `npm test` | Socket reconnect + number-formatting assertions, no test framework needed |
| `npm run typecheck` | `tsc --noEmit` |

## Architecture

There is no backend. The browser holds **one** multiplexed Binance WebSocket for
every watched pair and fetches candle history over REST directly.

```
Browser ──1 combined WS──> wss://stream.binance.com:9443/stream
        └──REST──────────> api.binance.com   (snapshot, klines, exchangeInfo)
```

### Keep Binance calls in the browser

> **Binance answers requests from server IPs in some regions with HTTP 451.**

Every exchange call is client-side on purpose. It runs from the user's own IP, so
the geo-block never applies; it keeps rate limits per-user instead of pooled
across everyone hitting our origin; and it lets the whole app prerender to static
files. Moving any of these fetches into a route handler or server component will
appear to work locally and then fail once deployed.

When the backend/database phase arrives, it goes in as Next.js API routes
alongside — not underneath — this path.

### Layout

| Path | Role |
|---|---|
| `lib/binance/socket.ts` | The one connection. Reconnect with backoff, live SUBSCRIBE/UNSUBSCRIBE reconciliation. |
| `lib/binance/rest.ts` | Snapshot, candles, trend lines, and per-symbol `tickSize`. |
| `lib/hooks/useMarketData.ts` | Owns the socket and every piece of state derived from it. |
| `lib/hooks/usePriceFlash.ts` | The per-tick green/red pulse, shared by the row and card views. |
| `lib/hooks/useReorder.ts` | Drag-to-reorder gesture handling. |
| `lib/reorder.ts` | The pure reorder maths, extracted so it can be tested directly. |
| `components/Sparkline.tsx` | The per-row 24h trend line — inline SVG, no chart library. |
| `components/TickerRow.tsx` | Desktop table row. |
| `components/TickerCard.tsx` | Narrow-screen card — a phone cannot hold five numeric columns. |

## How the two charts differ

Each watchlist row carries a **24h trend line**: 48 half-hourly closes drawn as
an inline SVG, with the live ticker price as its tip. It is deliberately not a
`lightweight-charts` instance — one chart object per row would be far heavier
than a 20-line path, and a sparkline has no axes, crosshair or zoom to justify it.

Clicking a row opens that pair in the **full candlestick chart**, which is
where `lightweight-charts` earns its weight.

The trend line's vertical span is the window's own high and low, so the tip dot
also shows roughly where price sits in its range — which is why the table has no
separate range-bar column. The mobile card keeps the exact range bar, since
vertical space there is free.

Trend data refreshes every 5 minutes over REST. Its tip is already live from the
ticker stream, so the refresh only has to stop the 24h window from sliding out of
date; subscribing to a kline stream per pair would push an event every second to
learn something that changes every half hour.

## Reordering the watchlist

Drag a row by its grip, or focus the grip and use the arrow keys. Order persists
to localStorage.

Built on **Pointer Events**, not the HTML5 drag-and-drop API — that API does not
fire on touch devices at all, and this list has a mobile presentation. One
pointer code path covers mouse, touch and pen.

Two rules make the gesture behave:

- **The grip has `touch-action: none`; the row body must not.** Without it the
  browser scrolls instead of reporting pointer moves. Applying it to the whole
  row would stop the watchlist scrolling on a phone, which is why a touch drag
  only starts from the grip. A mouse can drag from anywhere on the row, since
  there is a 4px threshold separating a drag from a click.
- **Drop target is leading-edge against the neighbour's midpoint.** See
  `resolveDropTarget` in `lib/reorder.ts`; two more obvious rules are both wrong
  and the reasons are written down there.

## Three things that are easy to break

**Price decimals come from `tickSize`, never a constant.** BTCUSDT ticks in
`0.01` (2 dp) and DOGEUSDT in `0.00001` (5 dp). A blanket `toFixed(2)` renders
DOGE as `0.08` and throws away the digits being watched. Covered by `npm test`.

**Reconnection is a normal code path.** Binance force-closes every connection at
the 24-hour mark. On every reconnect the app re-fetches a REST snapshot, because
ticks that arrived while offline are gone and the 24h high/low may have moved.

**The price cell must not be remounted to animate.** Restarting a CSS animation
requires replacing the node, and a node replaced ten times a second cannot be
reliably clicked — mousedown and mouseup land on different elements. The flash is
driven through the Web Animations API on a stable node instead.

**Sparkline gradients need per-instance ids.** Several render at once, and
duplicate SVG ids in one document are invalid markup that resolve by document
order rather than by the element that declared them. `useId()` keeps them unique.

**A drag must not swallow the next click.** A row's click handler ignores the
click that follows a drop, but that suppression has to be *timestamped*, not a
boolean: a drag ending over a different element than it began on produces no
click to clear the flag, so a plain boolean would eat the user's next genuine
click instead.

## Scope note

High, low and the trend line are Binance's **rolling 24-hour** window — the same basis
exchange sites and TradingView quote. That is deliberately not a calendar-day
session range; the two differ materially (at one sample: BTC's rolling-24h low
was 72,205 while its UTC-day low was 73,027).
