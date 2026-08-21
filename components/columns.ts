/**
 * Shared responsive visibility classes for the watchlist columns.
 *
 * Named constants rather than inline strings because the header cells live in
 * WatchlistTable and the body cells in TickerRow — they must hide together or
 * the table silently misaligns.
 *
 * The priority when space runs out: pair, last price, 24h %, high and low stay,
 * because those are the numbers the dashboard exists to show. Next is the trend
 * line, which is what makes the watchlist scannable. Absolute change (redundant
 * with the percentage), volume, and the range bar (whose position information
 * the trend line largely conveys) drop first.
 */
export const HIDE_UNTIL_SM = "hidden sm:table-cell";
export const HIDE_UNTIL_MD = "hidden md:table-cell";
export const HIDE_UNTIL_LG = "hidden lg:table-cell";
