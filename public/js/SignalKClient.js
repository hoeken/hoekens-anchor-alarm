// Thin client over Signal K's REST API. All Signal K reads go through here so
// URL construction, freshness checks, and value-extraction patterns live in
// one place. Designed so a future WebSocket/delta-backed implementation can
// replace the REST fetchers (subscribing to deltas and serving values from a
// local cache) without changing the static helpers or call sites that use them.

const SIGNALK_DEFAULT_FRESHNESS_SEC = 300;

export class SignalKClient {
  constructor({ baseUrl = "", pluginName = null } = {}) {
    this.baseUrl = baseUrl;
    this.pluginName = pluginName;
  }

  // Fetchers return native Promises that resolve with the parsed JSON body and
  // reject with { status, statusText } on HTTP errors. A WS rewrite would swap
  // these for delta-fed cache reads without changing call sites.
  request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    return fetch(`${this.baseUrl}/signalk/v1/api/${path}`, {
      signal: controller.signal,
    })
      .finally(() => clearTimeout(timer))
      .then(SignalKClient._toJsonOrReject);
  }

  raiseAnchor() {
    return this.pluginPost("raiseAnchor");
  }

  dropAnchor(position, radius) {
    return this.pluginPost("dropAnchor", { position, radius });
  }

  setRadius(radius) {
    return this.pluginPost("setRadius", { radius });
  }

  pluginPost(action, data) {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    }).then((response) => {
      if (response.status === 401) location.href = "/admin/#/login";
      return SignalKClient._toJsonOrReject(response);
    });
  }

  static _toJsonOrReject(response) {
    if (!response.ok) {
      return Promise.reject({
        status: response.status,
        statusText: response.statusText,
      });
    }
    return response.json();
  }

  fetchSelf() {
    return this.request("vessels/self");
  }
  fetchAllVessels() {
    return this.request("vessels");
  }
  fetchTracks(radius) {
    return this.request(`tracks?radius=${radius}`);
  }

  // Walk a subtree by dot-separated path. An empty path returns the tree itself
  // so callers can pass a notification envelope and read its `.value` via value().
  static extract(tree, path = "") {
    if (!tree) return null;
    if (!path) return tree;
    let node = tree;
    for (const key of path.split(".")) {
      if (node == null || typeof node !== "object") return null;
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
    if (!node || node.value === undefined) return fallback;
    if (!this.isFresh(node, maxAge)) {
      const ageSec = node.timestamp
        ? Math.round((Date.now() - new Date(node.timestamp).getTime()) / 1000)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKClient.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      return fallback;
    }
    return node.value;
  }

  static isFresh(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    if (!delta || !delta.timestamp) return false;
    const ageSec = (Date.now() - new Date(delta.timestamp).getTime()) / 1000;
    return ageSec <= maxAge;
  }

  static isStale(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    return !this.isFresh(delta, maxAge);
  }
}
