/**
 * A single multiplexed Binance market-data socket.
 *
 * One connection carries every stream the dashboard needs — a `@ticker` per
 * watchlist pair plus the selected pair's `@kline_<interval>`. Streams are added
 * and removed at runtime with SUBSCRIBE / UNSUBSCRIBE, so switching chart
 * interval never interrupts the price table.
 *
 * Reconnection is a normal code path, not an error path: Binance force-closes
 * every connection at the 24-hour mark. Whenever we come back we tell the caller
 * to re-fetch a REST snapshot, because ticks that arrived while we were offline
 * are gone for good and the 24h high/low may have moved.
 */
import { combinedStreamUrl } from "./streams";
import type {
  CombinedStreamMessage,
  ConnectionStatus,
  RawKlineEvent,
  RawTickerEvent,
} from "./types";

interface SocketHandlers {
  onTicker: (event: RawTickerEvent) => void;
  onKline: (event: RawKlineEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** Fired after every successful (re)connect, including the first. */
  onConnected: () => void;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export class BinanceSocket {
  private ws: WebSocket | null = null;
  private streams = new Set<string>();
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private started = false;
  private nextRequestId = 1;

  constructor(private readonly handlers: SocketHandlers) {}

  /**
   * Declare the streams this socket should be carrying.
   *
   * Idempotent and safe to call on every render-driven change: the first call
   * opens the connection, and later calls reconcile the live subscription as
   * SUBSCRIBE/UNSUBSCRIBE deltas — so changing the chart interval never blanks
   * the price table. Keeping "have we connected yet?" inside the socket means
   * callers cannot accidentally open a second connection.
   */
  sync(next: string[]): void {
    if (this.disposed || next.length === 0) return;

    if (!this.started) {
      this.started = true;
      this.streams = new Set(next);
      this.connect();
      return;
    }

    const desired = new Set(next);
    const toAdd = [...desired].filter((s) => !this.streams.has(s));
    const toRemove = [...this.streams].filter((s) => !desired.has(s));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    this.streams = desired;

    // If the socket is down, the new set is picked up by the next connect().
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (toRemove.length > 0) this.send("UNSUBSCRIBE", toRemove);
    if (toAdd.length > 0) this.send("SUBSCRIBE", toAdd);
  }

  /** Tear down permanently. Safe to call twice. */
  dispose(): void {
    this.disposed = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      // Detach handlers first so an in-flight close event cannot schedule a retry.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private send(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]): void {
    this.ws?.send(
      JSON.stringify({ method, params, id: this.nextRequestId++ }),
    );
  }

  private connect(): void {
    if (this.disposed || this.streams.size === 0) return;

    this.handlers.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    // Browsers answer the server's protocol-level ping automatically, so there
    // is no manual keepalive to maintain here.
    const ws = new WebSocket(combinedStreamUrl([...this.streams]));
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) return;
      this.attempts = 0;
      this.handlers.onStatus("live");
      this.handlers.onConnected();
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (this.disposed) return;
      this.route(event.data);
    };

    // An error is always followed by a close, so all retry logic lives in onclose.
    ws.onerror = () => {};

    ws.onclose = () => {
      if (this.disposed || this.ws !== ws) return;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private route(payload: string): void {
    let message: CombinedStreamMessage<RawTickerEvent | RawKlineEvent>;
    try {
      message = JSON.parse(payload);
    } catch {
      return;
    }
    // SUBSCRIBE/UNSUBSCRIBE acknowledgements have no `stream` field.
    if (!message.stream || !message.data) return;

    const { data } = message;
    if (data.e === "24hrTicker") this.handlers.onTicker(data);
    else if (data.e === "kline") this.handlers.onKline(data);
  }

  private scheduleReconnect(): void {
    this.handlers.onStatus("reconnecting");
    // Exponential backoff with jitter, so a Binance-side blip does not turn
    // every open tab into a synchronized retry stampede.
    const base = Math.min(
      INITIAL_BACKOFF_MS * 2 ** this.attempts,
      MAX_BACKOFF_MS,
    );
    const delay = base * (0.5 + Math.random() * 0.5);
    this.attempts += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }
}
