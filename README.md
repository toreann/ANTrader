# ANTrader

A crypto spot terminal across two venues: **Binance** spot and **Jupiter** on
Solana. The candlestick chart sits on the left; every watched market is a square
tile on the right showing price, 24h change, a 24h trend line and the day's high
and low. Click a tile to load it in the chart, or drag it by the grip to
rearrange the grid. Selecting a Solana token also shows a live Jupiter routing
quote.

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
| `npm test` | 108 offline assertions — socket reconnect, formatting, reorder maths, base-unit scaling. No test framework |
| `npm run test:live` | Hits Binance and Jupiter for real, to catch the venues changing under us |
| `npm run typecheck` | `tsc --noEmit` |

## Two venues, one watchlist

Entries are venue-qualified strings — `binance:BTCUSDT`, `jupiter:<mint>` — and
every map in the app is keyed by them, so a Binance pair and a Solana token that
share a ticker symbol can never collide. A bare `"BTCUSDT"` from before Jupiter
existed reads as a Binance entry, so old watchlists migrate on read with no
versioning step.

The venues are **not** equivalent, and the UI says so rather than blurring it:

| | Binance | Jupiter |
|---|---|---|
| Transport | WebSocket, ~1 push/sec | REST only, polled every 5s |
| 24h high/low | published directly | **derived from candles** |
| Quote currency | USDT pair | USD |

### Searching for markets

One search box covers both venues — the user is looking for a market, not
choosing an API. Typing "SOL" returns Binance's SOLUSDT and Solana's SOL side by
side, each badged, and picking either adds it. Both venues are queried in
parallel with `allSettled`, so one being down still shows the other's results
plus a note that the list is incomplete.

Relevance is decided locally, because neither venue gives it for free:

- **Binance has no search endpoint at all.** The symbol list is held client-side
  from `/ticker/price` — 156KB for ~3.7k symbols, versus **17MB** for
  `/exchangeInfo` covering the same ground. Fetched lazily on first search, so a
  user who never searches never pays for it. Ranking prefers exact matches, then
  stablecoin quotes, and penalises Binance's leveraged tokens (UP/DOWN/BULL/
  BEAR) — otherwise searching "BTC" fills up with BTCUP and BTCDOWN.
- **Jupiter's order is mostly by liquidity**, which buries the token you searched
  for under its own derivatives: "SOL" returned BNSOL and JitoSOL above SOL.
  Re-ranked so **verification dominates absolutely**, then symbol relevance, then
  liquidity. That ordering is a safety property, not a preference: anyone can
  mint a token called "BTC", a search returns several unverified ones, and an
  earlier weighted-sum version ranked those impostors above the real WBTC because
  an exact symbol match outscored being verified.

The header carries a **separate health readout per venue** for this reason — one
venue failing must not be masked by the other still working. A venue with
nothing watched reports `Idle` rather than `Live`, because claiming a healthy
connection for a path that is not being exercised is not a claim the app has
earned.

Jupiter has no streaming API, and `price/v3` answers with
`cache-control: max-age=5` — so five seconds is the honest ceiling, not a
throttle we chose. Each tile is badged with its venue for exactly this reason: a
tile that appears to move less is not necessarily a quieter market.

Jupiter's price endpoint carries **no extremes at all**, so high and low are
computed from a 15-minute candle series (96 candles = 24h), which doubles as the
trend line — one request per token rather than two. Those extremes are then
widened by each polled price, so a fresh high shows immediately instead of at the
next refresh.

### The chart host is undocumented

Prices, token search and quotes come from `lite-api.jup.ag`, which is Jupiter's
documented keyless tier. **OHLCV comes from `datapi.jup.ag`, which is not in
their published API** — it is what Jupiter's own frontend uses. It works, but
treat it as load-bearing and unsupported: `npm run test:live` exists largely to
notice when it changes.

One trap worth stating plainly: that endpoint takes `from`/`to` in
**milliseconds** but returns each candle's `time` in **seconds**.

## Quotes are read-only

The quote panel calls Jupiter's quote endpoint and nothing else. It builds no
transaction, connects no wallet and signs nothing — the numbers are indicative
price discovery, and the panel is labelled as such. Adding execution would mean a
wallet adapter, priority fees and a confirmation flow, none of which is here.

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
| `lib/watchlist.ts` | Venue-qualified watchlist entries and their storage format. |
| `lib/jupiter/rest.ts` | Jupiter prices, candles, token search and read-only swap quotes. |
| `lib/binance/socket.ts` | The one Binance connection. Reconnect with backoff, live SUBSCRIBE/UNSUBSCRIBE reconciliation. |
| `lib/binance/rest.ts` | Snapshot, candles, trend lines, and per-symbol `tickSize`. |
| `lib/hooks/useMarketData.ts` | Owns the socket and every piece of state derived from it. |
| `lib/hooks/usePriceFlash.ts` | The per-tick green/red pulse. |
| `lib/hooks/useReorder.ts` | Drag-to-reorder gesture handling, in two dimensions. |
| `lib/reorder.ts` | The pure reorder maths, extracted so it can be tested directly. |
| `components/Sparkline.tsx` | The per-tile 24h trend line — inline SVG, no chart library. |
| `components/AssetTile.tsx` | One market as a square tile. |
| `components/CopyContractButton.tsx` | Copies a token's mint. Only on markets that have one. |
| `components/WatchlistGrid.tsx` | The tile grid — one presentation for every screen size. |
| `components/QuotePanel.tsx` | Read-only Jupiter routing quote for the selected token. |

## Layout

The chart is a **square** block anchored to the top-right, and the watchlist
flows *around* it — down the columns to its left, then full-width beneath it.

That requires the chart and the tiles to be siblings in **one** grid rather than
two panels, which is why `WatchlistGrid` renders its wrapper as
`display: contents`: a wrapper that formed its own box would put the whole
watchlist beside the chart instead of around it. `grid-auto-flow: dense` does the
wrapping, packing tiles into the earliest free cells.

Squareness falls out of the grid rather than being measured. Every cell is
`aspect-square`, so a chart spanning N columns and N rows is square by
construction — verified at 488x488, 731x731 and 977x977. It is also
`aspect-square` itself, which is the actual guarantee: the row span reserves the
cells, but a row containing no tiles would otherwise be free to collapse.

Column counts are fixed per breakpoint rather than `auto-fill`, because the chart
is placed relative to the *last* column line and that requires knowing how many
columns exist. Below `sm` there is no room either side, so the chart takes the
full width and the tiles sit beneath it.

**Chart size is adjustable two ways, and always lands on a whole cell.** Drag
the chart's bottom-left corner — the only corner that can move, since the chart
is anchored top-right — or use the stepper in the toolbar. Arrow keys work on the
grip too, and the size is remembered.

The gesture is built to feel fluid without reflowing the grid in real time,
because snapping alone felt broken:

- **A dashed outline follows the pointer exactly**, unsnapped, with a label
  showing the span it will land on. Without it there was a whole cell of travel
  where nothing moved at all, then a lurch. The grid itself does not move during
  the drag — measured identical through a five-step drag — so there is no
  per-frame layout or canvas re-render.
- **The commit is FLIP-animated** (`useGridFlip`). A grid item's size comes from
  its track sizing, which is *not* a transitionable property, so a span change
  jumps however much CSS transition is declared. Measuring before and after and
  animating the difference as a transform is the way around that, and it moves
  the tiles into their new positions in the same pass.

Both controls are hidden below `sm`, where the chart takes the full width
whatever the span — a control that cannot change anything is worse than no
control.

The `+ gap` in that inverse matters: a span of N is `N*cell + (N-1)*gap` across,
and omitting it makes the chart lag a cell behind the pointer at larger sizes.

Tiles are strictly `aspect-square`, laid out with
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

## Copying a contract address

DEX tiles carry a copy button for the token's mint. It is gated on the market
*having* an address rather than on the venue being Jupiter, so a second DEX gets
it for free — and a Binance pair never shows it, because an exchange symbol is
not a contract.

Two things it gets right that are easy to get wrong:

- **It reports failure.** `navigator.clipboard.writeText` needs a secure *and
  focused* document and can be refused outright; there is a legacy
  `execCommand` fallback, and if both fail the button shows a cross rather than
  a tick. Claiming success you did not achieve is worse than admitting failure,
  especially for an address someone is about to paste into a swap.
- **The outcome is announced, not just coloured.** A `role="status"` region says
  "Copied" or "Copy failed", so the result is not conveyed by colour alone.

## Tile controls are 24x24

The grip, the copy button and the remove button all have 24x24 hit areas around
much smaller glyphs — WCAG 2.5.8's minimum target size. They were 16x18, 20x16
and 18x24 before being measured, which is genuinely hard to hit on a phone. They
also stop pointer events propagating, so pressing one never starts a tile drag.

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

**On-chain decimals are not display decimals.** `SymbolMeta` carries both:
`priceDecimals` is how many digits to *show*, `tokenDecimals` is how many base
units make one whole token (9 for SOL, 6 for USDC). Passing the former where the
latter belongs shipped once and misquoted an amount by 100,000x — the quote panel
now refuses to render at all until the real decimals are known, rather than
guessing.

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
