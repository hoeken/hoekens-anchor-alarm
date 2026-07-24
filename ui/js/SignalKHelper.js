// Thin client over Signal K's REST API. All Signal K reads go through here so
// URL construction, freshness checks, and value-extraction patterns live in
// one place. Designed so a future WebSocket/delta-backed implementation can
// replace the REST fetchers (subscribing to deltas and serving values from a
// local cache) without changing the static helpers or call sites that use them.

const SIGNALK_DEFAULT_FRESHNESS_SEC = 60;

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
  // charts, then tracks, then history, which is the order they run.
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("Request timed out"), 5000);
    return fetch(`${this.baseUrl}/signalk/v1/api/${path}`, {
      signal: controller.signal,
    })
      .finally(() => clearTimeout(timer))
      .then(SignalKHelper._toJsonOrReject);
  }

  raiseAnchor() {
    return this.pluginPost("raiseAnchor");
  }

  dropAnchor(position, zone) {
    return this.pluginPost("dropAnchor", { position, zone });
  }

  setZone(zone) {
    return this.pluginPost("setZone", { zone });
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

  // The server's identity for our own vessel (e.g.
  // "vessels.urn:mrn:imo:mmsi:123456789"), used to pick our entry out of the
  // bulk /vessels payload. Normally that identity arrives on ui-config
  // (selfId); this tiny public endpoint is the fallback for anonymous
  // sessions, which can't read ui-config.
  fetchSelfId() {
    return this.request("self");
  }
  fetchAllVessels() {
    return this.request("vessels");
  }
  // Fetch a single vessel's tree by its stream context (e.g.
  // "vessels.urn:mrn:imo:mmsi:123456789"). Used for a one-shot static snapshot
  // of a newly-sighted AIS target without re-pulling the whole /vessels tree.
  fetchVessel(context) {
    const id = String(context).replace(/^vessels\./, "");
    return this.request(`vessels/${id}`);
  }
  fetchTracks(radius) {
    return this._enqueueHeavy(() => this.request(`tracks?radius=${radius}`));
  }
  // Recorded anchoring sessions (drop/raise spans) from the plugin's session
  // log, newest first. Plain fetch rather than pluginFetch on purpose: this is
  // called silently at startup (track rehydration), and a 401 there must
  // reject quietly instead of popping the login modal uninvited.
  fetchSessions() {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/sessions`)
      .then(SignalKHelper._toJsonOrReject);
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
    // The AbortController/timer are created inside the queued callback so the
    // 15s deadline only starts once this request actually runs, not while it
    // waits behind other heavy reads in the queue.
    return this._enqueueHeavy(() => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("Request timed out"), 15000);
      return fetch(
        `${this.baseUrl}/signalk/v2/api/history/values?${params.toString()}`,
        { signal: controller.signal },
      )
        .finally(() => clearTimeout(timer))
        .then(SignalKHelper._toJsonOrReject);
    });
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
      const value = row[index + 1]; // row[0] is the timestamp
      if (
        value &&
        typeof value.latitude === "number" &&
        typeof value.longitude === "number"
      )
        positions.push({
          time: row[0],
          latitude: value.latitude,
          longitude: value.longitude,
        });
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
