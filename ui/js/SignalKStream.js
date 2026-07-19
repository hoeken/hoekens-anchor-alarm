// Minimal native-WebSocket replacement for @signalk/client. We only ever used
// that package's streaming delta feed (connect + subscribe + "delta"/"connect"
// events), so a thin wrapper over the browser's WebSocket covers our needs
// without the dependency — which also drops the vulnerable uuid chain it pulled
// into the bundle.
//
// The Signal K streaming API is a WebSocket at /signalk/v1/stream. We open it
// with ?subscribe=none so nothing flows until we send our own subscription
// (matching the old autoConnect:false + explicit subscribe() flow), then route
// every parsed delta message to "delta" listeners. The "connect" event fires on
// every (re)connection, so the caller's connect handler re-subscribes after a
// reconnect without any extra bookkeeping here.
//
// The very first frame the server sends is a "hello" carrying the `self`
// identity (e.g. "vessels.urn:mrn:imo:mmsi:123456789"). It has no `updates`, so
// it isn't a delta; we surface it via the "hello" event and stash it on `.self`
// so callers can tell own-boat deltas apart from other vessels' once they
// subscribe to more than one context.

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export class SignalKStream {
  constructor({ hostname, port, useTLS = false, reconnect = true } = {}) {
    this.hostname = hostname;
    this.port = port;
    this.useTLS = useTLS;
    this.reconnect = reconnect;
    this.ws = null;
    this.self = null;
    this.listeners = { delta: [], connect: [], hello: [] };
    this._reconnectDelay = RECONNECT_BASE_MS;
    this._closed = false;
  }

  on(event, callback) {
    if (this.listeners[event])
      this.listeners[event].push(callback);
    return this;
  }

  _emit(event, arg) {
    for (const callback of this.listeners[event] || [])
      callback(arg);
  }

  connect() {
    this._closed = false;
    const proto = this.useTLS ? "wss" : "ws";
    const url = `${proto}://${this.hostname}:${this.port}/signalk/v1/stream?subscribe=none`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this._reconnectDelay = RECONNECT_BASE_MS;
      this._emit("connect");
    };

    ws.onmessage = (event) => {
      let delta;
      try {
        delta = JSON.parse(event.data);
      } catch {
        return; // ignore any non-JSON frame
      }
      // The hello frame carries `self` and no `updates`; capture it and route
      // it separately so it isn't mistaken for a delta.
      if (delta && delta.self !== undefined && !delta.updates) {
        this.self = delta.self;
        this._emit("hello", delta);
        return;
      }
      this._emit("delta", delta);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.reconnect && !this._closed) {
        setTimeout(() => this.connect(), this._reconnectDelay);
        // Exponential backoff so a server that's down doesn't get hammered.
        this._reconnectDelay = Math.min(
          this._reconnectDelay * 2,
          RECONNECT_MAX_MS,
        );
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror and owns the reconnect; just ensure the
      // socket is closing so we don't leak a half-open connection.
      if (ws.readyState === WebSocket.OPEN)
        ws.close();
    };
  }

  subscribe(message) {
    this.send(message);
  }

  // Send a subscribe frame if the socket is open. A frame sent while
  // reconnecting is silently dropped; callers re-issue their subscriptions on
  // the next "connect" event, so nothing is lost.
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close() {
    this._closed = true;
    if (this.ws)
      this.ws.close();
  }
}
