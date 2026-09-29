// Thin client over Signal K's REST API. All Signal K reads go through here so
// URL construction, freshness checks, and value-extraction patterns live in
// one place. Designed so a future WebSocket/delta-backed implementation can
// replace the REST fetchers (subscribing to deltas and serving values from a
// local cache) without changing the static helpers or call sites that use them.

const SIGNALK_DEFAULT_FRESHNESS_SEC = 60;
// The track queries ask for at least the last day, reaching back to the start
// of the current anchoring session when it is older, so the approach and the
// drop are drawn however long the stay. Their `resolution` spaces the points
// so no vessel's track exceeds TRACK_MAX_POINTS: one second for a day,
// proportionally coarser beyond.
const TRACK_MIN_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRACK_MAX_POINTS = 86400;
// /self/track merges in a history provider's record, so it gets the History
// API's deadline rather than request()'s.
const OWN_TRACK_TIMEOUT_MS = 15000;

export class SignalKHelper {
  constructor({ baseUrl = "", pluginName = null } = {}) {
    this.baseUrl = baseUrl;
    this.pluginName = pluginName;
    // Optional handler invoked when an auth-gated request returns 401 (e.g. an
    // expired session). The app sets this to open the login modal; when unset
    // we fall back to redirecting to the SignalK admin login.
    this.onUnauthorized = null;
    // Tail of the heavy-read serialization chain (see _enqueueHeavy). Starts
    // resolved so the first heavy request runs immediately.
    this._heavyTail = Promise.resolve();
  }

  // Serialize the heavy REST reads — the local chart catalog, fleet tracks, and
  // position history — so they run one at a time instead of hammering the
  // server all at once at startup. On lightweight hardware (a Raspberry Pi's
  // single-threaded SignalK process plus a disk-backed history provider) three
  // concurrent heavy queries contend and all slow down; served back-to-back
  // each stays fast. The queue is strict FIFO with a concurrency of one, so
  // requests execute in the order callers enqueue them — startup enqueues
  // charts, then the one-minute history probe, then the tracks (which first
  // wait for their window), which is the order they run.
  //
  // `fn` (which performs the actual fetch, and arms any request timeout it
  // sets) is invoked only when its turn comes up, so time spent waiting in the
  // queue never counts against a request's own deadline. A failed request
  // rejects its own caller but does not stall the queue: the tail advances on
  // settle regardless of outcome.
  _enqueueHeavy(fn) {
    const result = this._heavyTail.then(fn, fn);
    this._heavyTail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  // Authenticate against SignalK's REST endpoint. On success the server sets
  // the JAUTHENTICATION cookie, which (being same-origin) is then sent
  // automatically on every subsequent request — the same cookie the auth-gated
  // plugin POSTs already rely on. Rejects with { status, statusText } on bad
  // credentials (401) or other HTTP errors. The rejection also carries the
  // backend's { message } when the error body includes one.
  login(username, password, rememberMe = false) {
    return fetch(`${this.baseUrl}/signalk/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rememberMe }),
    }).then(SignalKHelper._toJsonOrReject);
  }

  // Log out of SignalK: a PUT with no body that clears the JAUTHENTICATION
  // cookie server-side. The response is plain text ("Logout OK"), not JSON, so
  // we resolve on any 2xx rather than parsing a body. Rejects with { status,
  // statusText } on HTTP error. Callers reload afterward so the app re-fetches
  // as an anonymous user.
  logout() {
    return fetch(`${this.baseUrl}/signalk/v1/auth/logout`, {
      method: "PUT",
    }).then((response) => {
      if (!response.ok)
        return Promise.reject({
          status: response.status,
          statusText: response.statusText,
        });
      return true;
    });
  }

  // Fetchers return native Promises that resolve with the parsed JSON body and
  // reject with { status, statusText, message } on HTTP errors (message is the
  // backend's error text when present).
  request(path) {
    return SignalKHelper._getJson(`${this.baseUrl}/signalk/v1/api/${path}`);
  }

  // GET a URL as JSON under a deadline, so a server that accepts the connection
  // but never answers (flaky boat network) can't hang callers forever.
  static _getJson(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort("Request timed out"),
      timeoutMs,
    );
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(timer))
      .then(SignalKHelper._toJsonOrReject);
  }

  // Who the browser session is to the server and what it's allowed to do — the
  // first request the app makes, since every auth-gated control keys off it (see
  // ui/js/Identity.js for the payload shape and how it maps to permissions).
  // Lives outside /signalk/v1/api, so it can't go through request(). The server
  // sends it no-cache and rate-limits it, so call it once per page load.
  fetchLoginStatus() {
    return SignalKHelper._getJson(`${this.baseUrl}/skServer/loginStatus`);
  }

  raiseAnchor() {
    return this.pluginPost("raiseAnchor");
  }

  dropAnchor(position, zone) {
    return this.pluginPost("dropAnchor", { position, zone });
  }

  // `position` optionally moves the anchor in the same update. Moves go
  // through setZone rather than dropAnchor because a re-drop starts a new
  // entry in the plugin's session log.
  setZone(zone, position) {
    return this.pluginPost("setZone", { zone, position });
  }

  pluginPost(action, data) {
    return this.pluginFetch(action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    });
  }

  // Fetch a plugin route, funneling 401s through the shared auth handler (open
  // the login modal, or fall back to the admin login redirect) before parsing
  // the JSON body. Every auth-gated plugin call goes through here.
  pluginFetch(action, init) {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/${action}`, init).then(
      (response) => {
        if (response.status === 401) {
          if (typeof this.onUnauthorized === "function") {
            this.onUnauthorized();
          } else {
            const here = window.location.pathname + window.location.search + window.location.hash;
            window.location.href = "/admin/#/login?redirect=" + encodeURIComponent(here);
          }
        }
        return SignalKHelper._toJsonOrReject(response);
      },
    );
  }

  // URL of the custom own-boat icon (GET), used directly as the boat marker's
  // image source. Pass a cache-busting token (e.g. Date.now()) after an
  // upload/delete so the browser refetches the overwritten-in-place file.
  boatIconUrl(bust) {
    const base = `${this.baseUrl}/plugins/${this.pluginName}/icon`;
    return bust ? `${base}?v=${bust}` : base;
  }

  // Upload/replace the custom own-boat icon. The body is the raw image bytes
  // with the file's own MIME type; the backend detects the real type from the
  // magic bytes regardless.
  uploadBoatIcon(file) {
    return this.pluginFetch("icon", {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
  }

  deleteBoatIcon() {
    return this.pluginFetch("icon", { method: "DELETE" });
  }

  static _toJsonOrReject(response) {
    if (!response.ok) {
      // Our plugin routes reply with a JSON { message } body describing why the
      // request failed (e.g. "boat is outside the watch zone — alarm would
      // trigger immediately"). Read it so callers can surface the real reason
      // rather than the bare HTTP status. Tolerate a non-JSON body (some
      // SignalK errors are plain text) by falling back to no message.
      return response
        .json()
        .catch(() => null)
        .then((body) =>
          Promise.reject({
            status: response.status,
            statusText: response.statusText,
            message: body?.message,
          }),
        );
    }
    return response.json();
  }

  // Our own vessel's tree, the one-shot seed for AppState at startup. Every
  // other vessel arrives over the vessels.* delta subscription instead, so the
  // (potentially large) bulk /vessels tree is no longer worth transferring.
  fetchSelfVessel() {
    return this.request("vessels/self");
  }
  // Every vessel's track within `radius` of our own, from the tracks plugin's
  // own store. `window` is a trackWindow().
  fetchTracks(radius, window) {
    return this._enqueueHeavy(() =>
      this.request(`tracks?radius=${radius}&${SignalKHelper.trackQuery(window)}`),
    );
  }
  // Our own vessel's track from the tracks plugin. Unlike /tracks, this route
  // fills the window from a history provider where one has recorded it, at
  // the requested resolution, and from the plugin's store elsewhere. Tracks
  // plugin 2.x has no such route, so callers treat any failure as "no own
  // track here" and fall back to the own entry in /tracks.
  fetchOwnTrack(window) {
    return this._enqueueHeavy(() =>
      SignalKHelper._getJson(
        `${this.baseUrl}/signalk/v1/api/self/track?${SignalKHelper.trackQuery(window)}`,
        OWN_TRACK_TIMEOUT_MS,
      ),
    );
  }
  // Recorded anchoring sessions (drop/raise spans) from the plugin's session
  // log, newest first. Not pluginFetch on purpose: this is called silently at
  // startup (the track window), and a 401 there must reject quietly instead
  // of popping the login modal uninvited.
  fetchSessions() {
    return SignalKHelper._getJson(
      `${this.baseUrl}/plugins/${this.pluginName}/sessions`,
    );
  }
  deleteSession(id) {
    return this.pluginFetch(`sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
  // Fetch own-vessel position history from the server's v2 History API,
  // served by a history provider plugin (e.g. signalk-questdb). `from`/`to`
  // are ISO timestamps; `resolution` (seconds) downsamples server-side so a
  // multi-day anchorage doesn't return every raw fix. Rejects on HTTP error —
  // including the 404/501 when no history provider is installed, which
  // callers treat as "history unavailable".
  // Timeout mirrors request() so a provider that accepts the connection but
  // never answers (flaky boat network) can't hang callers — the startup
  // probe in particular must always settle. History queries scan a database,
  // so the deadline is more generous than request()'s 5s.
  fetchPositionHistory(from, to, resolution) {
    const params = new URLSearchParams({
      from,
      to,
      paths: "navigation.position",
    });
    if (resolution)
      params.set("resolution", String(resolution));
    // The deadline is armed inside the queued callback so the 15s only starts
    // once this request actually runs, not while it waits behind other heavy
    // reads in the queue.
    return this._enqueueHeavy(() =>
      SignalKHelper._getJson(
        `${this.baseUrl}/signalk/v2/api/history/values?${params.toString()}`,
        15000,
      ),
    );
  }
  // Whether a history provider is available: a minimal one-minute values
  // query that any provider satisfies cheaply. Resolves a boolean, never
  // rejects, so startup can branch without try/catch.
  probeHistory() {
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 1000);
    return this.fetchPositionHistory(from.toISOString(), to.toISOString(), 60)
      .then(() => true)
      .catch(() => false);
  }
  // The window and point spacing (whole seconds) for the track queries; see
  // TRACK_MIN_WINDOW_MS. `sessionStart` is the open anchoring session's
  // droppedAt, or undefined when the anchor is up or the log is unreadable.
  static trackWindow(sessionStart, now = Date.now()) {
    let from = now - TRACK_MIN_WINDOW_MS;
    const dropped = Date.parse(sessionStart);
    if (Number.isFinite(dropped) && dropped < from)
      from = dropped;
    const resolution = Math.max(
      1,
      Math.ceil((now - from) / 1000 / TRACK_MAX_POINTS),
    );
    return { from: new Date(from).toISOString(), resolution };
  }
  // Query string for the tracks plugin's v1 routes. `times` returns when each
  // point was recorded, so the glitch filter judges real intervals. Tracks
  // plugin 3.x answers 400 to any parameter it doesn't read, so only these
  // go in; 2.x reads none of them and returns its whole in-memory buffer.
  static trackQuery({ from, resolution }) {
    return new URLSearchParams({
      from,
      resolution: `${resolution}s`,
      times: "true",
    }).toString();
  }
  // Flatten one vessel's track from the tracks plugin — a MultiLineString of
  // [lon, lat] segments, plus a parallel `times` array when the plugin sends
  // one — into [{latitude, longitude, time}] oldest first, with the segments
  // joined into one line. `time` is epoch ms, or null without times.
  static trackPoints(track) {
    const points = [];
    const segments = Array.isArray(track?.coordinates) ? track.coordinates : [];
    segments.forEach((segment, s) => {
      const times = track.times?.[s];
      for (let i = 0; i < segment.length; i++) {
        const time = Date.parse(times?.[i]);
        points.push({
          latitude: segment[i][1],
          longitude: segment[i][0],
          time: Number.isFinite(time) ? time : null,
        });
      }
    });
    return points;
  }
  // A History API position value as {latitude, longitude}, or null for a
  // bucket without a fix. The API hands a position out as a [longitude,
  // latitude] pair — GeoJSON order, as the server's OpenAPI schema defines it
  // and as signalk-to-influxdb2 and signalk-parquet return it — but a
  // provider may hand out the data model's {latitude, longitude} object
  // instead. Both are read, so the track does not depend on which provider
  // answers. A third element (altitude) is ignored.
  static historyPosition(value) {
    if (Array.isArray(value)) {
      const [longitude, latitude] = value;
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
    }
    if (
      value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    )
      return { latitude: value.latitude, longitude: value.longitude };
    return null;
  }
  // Flatten a v2 History API values response (columns per requested path)
  // into [{time, latitude, longitude}] for the navigation.position column,
  // skipping the null rows a SAMPLE BY fill produces for empty buckets.
  static positionsFromHistory(response) {
    if (!response || !Array.isArray(response.data))
      return [];
    const index = (response.values || []).findIndex(
      (v) => v.path === "navigation.position",
    );
    if (index === -1)
      return [];
    const positions = [];
    for (const row of response.data) {
      // row[0] is the timestamp
      const position = SignalKHelper.historyPosition(row[index + 1]);
      if (position)
        positions.push({ time: row[0], ...position });
    }
    return positions;
  }
  // Fetch the local chart catalog from the v2 resources API (populated by a
  // charts provider plugin such as @signalk/charts-plugin). Hits the v2 path
  // directly since request() is hardwired to /signalk/v1/api/. Rejects like the
  // other fetchers on HTTP error, including a 404 when no charts plugin is
  // installed — callers treat that as "no local charts available".
  fetchCharts() {
    return this._enqueueHeavy(() =>
      fetch(`${this.baseUrl}/signalk/v2/api/resources/charts`)
        .then(SignalKHelper._toJsonOrReject),
    );
  }
  fetchConfig() {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/ui-config`)
      .then(SignalKHelper._toJsonOrReject);
  }
  saveConfig(config) {
    return this.pluginPost("ui-config", config);
  }
  // Persist one chart overlay's show/hide choice (a layer-control checkbox
  // toggle) for the current identity. A dedicated route rather than
  // saveConfig so the client never has to echo — and race other tabs over —
  // the whole per-chart map.
  saveChartEnabled(identifier, enabled) {
    return this.pluginPost("ui-config/charts", { identifier, enabled });
  }
  // Walk a subtree by dot-separated path. An empty path returns the tree itself
  // so callers can pass a notification envelope and read its `.value` via value().
  static extract(tree, path = "") {
    if (!tree)
      return null;
    if (!path)
      return tree;
    let node = tree;
    for (const key of path.split(".")) {
      if (node == null || typeof node !== "object")
        return null;
      node = node[key];
    }
    return node ?? null;
  }

  static value(tree, path = "", fallback = undefined) {
    const node = this.extract(tree, path);
    return node && node.value !== undefined ? node.value : fallback;
  }

  static freshValue(
    tree,
    path = "",
    { maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC, fallback = undefined } = {},
  ) {
    const node = this.extract(tree, path);
    if (!node || node.value === undefined)
      return fallback;
    if (!this.isFresh(node, maxAge)) {
      const ageSec = node.timestamp
        ? Math.round((Date.now() - new Date(node.timestamp).getTime()) / 1000)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      console.warn(msg);
      console.trace();
      return fallback;
    }
    return node.value;
  }

  static isFresh(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    if (!delta || !delta.timestamp)
      return false;
    const ageSec = (Date.now() - new Date(delta.timestamp).getTime()) / 1000;
    return ageSec <= maxAge;
  }

  static isStale(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    return !this.isFresh(delta, maxAge);
  }
}
