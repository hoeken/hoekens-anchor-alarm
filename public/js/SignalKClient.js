// Thin client over Signal K's REST API. All Signal K reads go through here so
// URL construction, freshness checks, and value-extraction patterns live in
// one place. Designed so a future WebSocket/delta-backed implementation can
// replace the REST fetchers (subscribing to deltas and serving values from a
// local cache) without changing the static helpers or call sites that use them.

const SIGNALK_DEFAULT_FRESHNESS_SEC = 300;

class SignalKClient {

  constructor({ baseUrl = '', pluginName = null } = {}) {
    this.baseUrl = baseUrl;
    this.pluginName = pluginName;
  }

  // Fetchers return a jQuery deferred so existing .done/.fail/.always chains
  // keep working. A WS rewrite would swap these for native Promises (or even
  // synchronous reads from a delta-fed cache).
  request(path) {
    return $.get(`${this.baseUrl}/signalk/v1/api/${path}`);
  }

  raiseAnchor() {
    return this.pluginPost('raiseAnchor');
  }

  dropAnchor(position, radius) {
    return this.pluginPost('dropAnchor', { position, radius });
  }

  setRadius(radius) {
    return this.pluginPost('setRadius', { radius });
  }

  pluginPost(action, data) {
    return $.post(`${this.baseUrl}/plugins/${this.pluginName}/${action}`, data)
      .fail((response) => {
        if (response.status === 401)
          location.href = "/admin/#/login";
      });
  }

  fetchSelf()              { return this.request('vessels/self'); }
  fetchAllVessels()        { return this.request('vessels'); }
  fetchTracks(radius)      { return this.request(`tracks?radius=${radius}`); }

  // Walk a subtree by dot-separated path. An empty path returns the tree itself
  // so callers can pass a notification envelope and read its `.value` via value().
  static extract(tree, path = '') {
    if (!tree) return null;
    if (!path) return tree;
    let node = tree;
    for (const key of path.split('.')) {
      if (node == null || typeof node !== 'object') return null;
      node = node[key];
    }
    return node ?? null;
  }

  static value(tree, path = '', fallback = undefined) {
    const node = this.extract(tree, path);
    return (node && node.value !== undefined) ? node.value : fallback;
  }

  static freshValue(tree, path = '', { maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC, fallback = undefined } = {}) {
    const node = this.extract(tree, path);
    if (!node || node.value === undefined) return fallback;
    if (!this.isFresh(node, maxAge)) {
      const ageSec = node.timestamp
        ? Math.round((Date.now() - new Date(node.timestamp).getTime()) / 1000)
        : 'unknown';
      console.error(`Stale Signal K value at ${path || '(root)'}: age ${ageSec}s, max ${maxAge}s`);
      return fallback;
    }
    return node.value;
  }

  static isFresh(sample, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    if (!sample || !sample.timestamp) return false;
    const ageSec = (Date.now() - new Date(sample.timestamp).getTime()) / 1000;
    return ageSec <= maxAge;
  }

  static isStale(sample, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    return !this.isFresh(sample, maxAge);
  }
}
