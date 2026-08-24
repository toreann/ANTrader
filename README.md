# ANTrader

A crypto spot terminal. The candlestick chart sits on the left; every watched
pair is a square tile on the right showing price, 24h change, a 24h trend line
and the day's high and low. Click a tile to load it in the chart, or drag it by
the grip to rearrange the grid.

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

### Files

| Path | Role |
|---|---|
| `lib/binance/socket.ts` | The one connection. Reconnect with backoff, live SUBSCRIBE/UNSUBSCRIBE reconciliation. |
| `lib/binance/rest.ts` | Snapshot, candles, trend lines, and per-symbol `tickSize`. |
| `lib/hooks/useMarketData.ts` | Owns the socket and every piece of state derived from it. |
| `lib/hooks/usePriceFlash.ts` | The per-tick green/red pulse. |
| `lib/hooks/useReorder.ts` | Drag-to-reorder gesture handling, in two dimensions. |
| `lib/reorder.ts` | The pure reorder maths, extracted so it can be tested directly. |
| `components/Sparkline.tsx` | The per-tile 24h trend line — inline SVG, no chart library. |
| `components/AssetTile.tsx` | One pair as a square tile. |
| `components/WatchlistGrid.tsx` | The tile grid — one presentation for every screen size. |

## Layout

The chart takes the left column at `xl` and the top when stacked — it is the
primary panel. Tiles are strictly `aspect-square`, laid out with
`auto-fill, minmax(9.5rem, 1fr)` so the column count follows the panel width
rather than a breakpoint: 2 columns on a phone, 3–4 on a desktop.

A square risks looking empty when large and cramped when small, so tile content
is distributed top to bottom with the trend line as the `flex-1` element — it
absorbs whatever height is left over. The chart is deliberately **not** square;
candlesticks need horizontal room for time, and a square chart would waste most
of a wide screen.

There is one presentation, not one per breakpoint. The previous table-plus-cards
arrangement mounted both and switched them with CSS, which forced a second
`useReorder` instance whose hidden geometry was all zeroes.

## How the two charts differ

Each tile carries a **24h trend line**: 48 half-hourly closes drawn as
an inline SVG, with the live ticker price as its tip. It is deliberately not a
`lightweight-charts` instance — one chart object per row would be far heavier
than a 20-line path, and a sparkline has no axes, crosshair or zoom to justify it.

Clicking a tile opens that pair in the **full candlestick chart**, which is
where `lightweight-charts` earns its weight.

The trend line's vertical span is the window's own high and low, so its tip dot
also shows roughly where price sits in that range. That is why there is no
separate range bar: the tile conveys the same thing, and the exact high and low
are printed underneath.

Trend data refreshes every 5 minutes over REST. Its tip is already live from the
ticker stream, so the refresh only has to stop the 24h window from sliding out of
date; subscribing to a kline stream per pair would push an event every second to
learn something that changes every half hour.

## Reordering the watchlist

Drag a tile by its grip, or focus the grip and use the arrow keys — left/right
move by one, up/down by a whole row. Order persists to localStorage.

Built on **Pointer Events**, not the HTML5 drag-and-drop API — that API does not
fire on touch devices at all. One pointer code path covers mouse, touch and pen.

A grid makes this genuinely two-dimensional: dragging onto the next tile is
usually *horizontal*, and crossing a row boundary is both axes at once. Two
things follow:

- **Drop target is the nearest slot centre**, with a small hysteresis margin so a
  tile parked between two slots does not flicker. Uniform squares make nearest-
  centre unambiguous, unlike the ragged heights of the old list.
- **Displacement is slot-based.** `slotOffsets` computes the order the grid
  *would* have and translates each tile from its own rect to the rect of the slot
  it would occupy. That expresses a row wrap — a tile moving up and to the right
  — which the old "shift by one row height" model could not represent at all.

And unchanged from the list version, because it is still right:

- **The grip has `touch-action: none`; the tile body must not.** Without it the
  browser scrolls instead of reporting pointer moves. Applying it to the tile
  would stop the grid scrolling on a phone, which is why a touch drag only starts
  from the grip. A mouse can drag from anywhere on the tile, since a 4px
  threshold separates a drag from a click.

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

**A drag must not swallow the next click.** A tile's click handler ignores the
click that follows a drop, but that suppression has to be *timestamped*, not a
boolean: a drag ending over a different element than it began on produces no
click to clear the flag, so a plain boolean would eat the user's next genuine
click instead.

**Tile labels use `term-muted`, not `term-dim`.** At 10px, `term-dim` measures
2.6:1 against the panel — under the 4.5:1 AA floor. Hierarchy comes from the
values being brighter than their labels, not from dimming the labels.

## Scope note

High, low and the trend line are Binance's **rolling 24-hour** window — the same basis
exchange sites and TradingView quote. That is deliberately not a calendar-day
session range; the two differ materially (at one sample: BTC's rolling-24h low
was 72,205 while its UTC-day low was 73,027).
