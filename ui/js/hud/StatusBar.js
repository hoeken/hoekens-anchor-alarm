// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.
//
// Statuses are keyed by id so transient conditions (stale data, failed
// fetches) can be cleared when they resolve. The most recently set entry
// wins. Levels map to a color: "status" inherits the panel's themed text
// color (empty string clears the inline override), "warning" (amber),
// "error" (red).

import { SignalKHelper } from "../SignalKHelper.js";

const LEVEL_COLORS = {
  status: "",
  warning: "#d97706",
  error: "red",
};

export const StatusBar = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "statusBar leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "statusBarUI";
    container.style.display = "none";
    this._container = container;
    this._items = new Map();
    this._logError = "";
    this._logErrorTimer = null;

    return container;
  },

  // Show a transient error message that clears itself after `timeout` seconds.
  // Stores the text in an internal variable that update() re-asserts each tick.
  logError: function (error, timeout = 3) {
    this._logError = error ? String(error) : "";

    if (this._logErrorTimer) {
      clearTimeout(this._logErrorTimer);
      this._logErrorTimer = null;
    }

    if (this._logError.length > 0) {
      this.set("log-error", this._logError);
      this._logErrorTimer = setTimeout(() => {
        this._logError = "";
        this._logErrorTimer = null;
        this.clear("log-error");
      }, timeout * 1000);
    }
    else
      this.clear("log-error");
  },

  set: function (id, text, level = "error") {
    if (!text) {
      this.clear(id);
      return;
    }
    this._items.set(id, { text, level, t: Date.now() });
    this._render();
  },

  clear: function (id) {
    if (this._items.delete(id))
      this._render();
  },

  // Reconcile staleness-driven entries against the current state every tick.
  // Other sources (page-load failures, plugin errors) push their own ids
  // through set()/clear() and coexist with these.
  update: function (state) {
    this.set(
      "gps",
      !state.currentCoordinates ? "Waiting for GPS position..." : null,
    );
    this.set(
      "position-stale",
      SignalKHelper.isStale(state.currentCoordinates)
        ? "Current Position data is stale."
        : null,
    );
    this.set(
      "heading-stale",
      state.heading && SignalKHelper.isStale(state.heading) ? "Heading data is stale." : null,
    );
    this.set(
      "below-keel-stale",
      state.belowKeel && SignalKHelper.isStale(state.belowKeel)
        ? "Depth Below Keel data is stale."
        : null,
    );
    this.set(
      "below-surface-stale",
      state.belowSurface && SignalKHelper.isStale(state.belowSurface)
        ? "Depth Below Surface data is stale."
        : null,
    );
    this.set(
      "twa-stale",
      state.twa && SignalKHelper.isStale(state.twa)
        ? "True Wind Angle data is stale."
        : null,
    );
    this.set(
      "aws-stale",
      state.aws && SignalKHelper.isStale(state.aws)
        ? "Apparent Wind Speed data is stale."
        : null,
    );

    // notice.value is null when normal-state notifications are disabled.
    let notice = state.anchor?.notification?.value;
    if (notice) {
      if (notice.state != "normal" && notice.message != "Watching") {
        let level = "status";
        if (notice.state == "alert" || notice.state == "warn")
          level = "warning";
        else if (notice.state == "alarm" || notice.state == "emergency")
          level = "error";
        this.set("notice-status", notice.message, level);
      }
      else
        this.set("notice-status");
    }
    else
      this.set("notice-status");

    this.set(
      "log-error",
      this._logError && this._logError.length > 0 ? this._logError : null,
    );
  },

  _render: function () {
    if (!this._container)
      return;
    if (!this._items.size) {
      this._container.style.display = "none";
      return;
    }
    let latest = null;
    for (const item of this._items.values()) {
      if (!latest || item.t > latest.t)
        latest = item;
    }
    this._container.textContent = latest.text;
    // "" falls back to the CSS-driven, theme-aware color on .statusBar.
    this._container.style.color = LEVEL_COLORS[latest.level] ?? "";
    this._container.style.display = "";
  },
});
