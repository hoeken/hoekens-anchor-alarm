// Thin client over Signal K's REST API. All Signal K reads go through here so
// URL construction, freshness checks, and value-extraction patterns live in
// one place. Designed so a future WebSocket/delta-backed implementation can
// replace the REST fetchers (subscribing to deltas and serving values from a
// local cache) without changing the static helpers or call sites that use them.

import { evaluate } from "mathjs/number";

const SIGNALK_DEFAULT_FRESHNESS_SEC = 60;

export class SignalKHelper {
  constructor({ baseUrl = "", pluginName = null } = {}) {
    this.baseUrl = baseUrl;
    this.pluginName = pluginName;
  }

  // Fetchers return native Promises that resolve with the parsed JSON body and
  // reject with { status, statusText } on HTTP errors.
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
      if (response.status === 401)
        location.href = "/admin/#/login";
      return SignalKHelper._toJsonOrReject(response);
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
  fetchConfig() {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/ui-config`)
      .then(SignalKHelper._toJsonOrReject);
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

  // Apply meta.displayUnits (formula + symbol + displayFormat) to a delta's
  // value. Returns { value, symbol, format } so callers can either format the
  // result or use the converted numeric value directly.
  static convertToDisplay(delta, value = false) {
    if (value === false)
      value = delta.value;
    let symbol = delta.meta?.units ?? "";
    let format = null;

    const displayUnits = delta.meta?.displayUnits;
    if (displayUnits) {
      if (displayUnits.formula && typeof value === "number") {
        value = evaluate(displayUnits.formula, { value });
      }
      if (displayUnits.symbol)
        symbol = displayUnits.symbol;
      if (displayUnits.displayFormat)
        format = displayUnits.displayFormat;
    }

    if (symbol == "foot")
      symbol = "ft";

    return { value, symbol, format };
  }

  // Apply meta.displayUnits.inverseFormula to convert a display-unit value
  // back to the delta's base unit. Returns the converted numeric value, or
  // the input unchanged when no inverseFormula is defined.
  static convertFromDisplay(delta, value) {
    const displayUnits = delta.meta?.displayUnits;
    if (displayUnits?.inverseFormula && typeof value === "number") {
      value = evaluate(displayUnits.inverseFormula, { value });
    }
    return value;
  }

  // Apply meta.displayUnits (formula + symbol + displayFormat) to a delta and
  // return a display-ready string. Falls back to meta.units when displayUnits
  // is absent, and to a bare String(value) when neither side specifies units.
  static formatDisplay(delta, decimals = false, value = false) {
    if (!delta)
      return "";
    if (value === false && (delta.value === undefined || delta.value === null))
      return "";

    const { value: converted, symbol, format } = this.convertToDisplay(delta, value);

    if (symbol == "ft")
      decimals = 0;

    let text;
    if (format && typeof converted === "number") {
      if (decimals === false)
        decimals = (format.split(".")[1] || "").length;
      text = converted.toFixed(decimals);
    } else {
      text = String(converted);
    }

    return symbol ? `${text} ${symbol}` : text;
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
