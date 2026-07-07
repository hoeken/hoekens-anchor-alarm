// AppState is our single source of truth for the current state of the application.

import { SignalKHelper } from "./SignalKHelper.js";
import { BoatConfig } from "./BoatConfig.js";
import {
  bearing as turfBearing,
  bearingToAzimuth,
  point,
  radiansToDegrees,
} from "@turf/turf";
import { GeoMath } from "./GeoMath.js";
import { watchZoneFromConfig } from "../../shared/watch-zones/index.js";
import { parseScopes, DEFAULT_SCOPES } from "../../shared/scopes.js";

const DEFAULT_FRESHNESS_SEC = 300;

const DELTA_FAST_SPEED = 250;
const DELTA_SLOW_SPEED = 1000;

// Window after a client-initiated anchor change during which incoming server
// updates for anchor.position/state/zone are ignored. Covers in-flight
// polls whose response was computed before the server processed our request,
// and the brief gap before the matching websocket delta arrives.
export const POST_ACTION_SETTLE_MS = 1000;

export class AppState {
  constructor() {
    this.anchor = {};
    this.tidalRise = 0;
    this.tidalFall = 0;
    // Which scope ratios to compute + display, and the resulting rode lengths.
    // Defaults until setScopeRatios() is called with the plugin config value.
    this.scopeRatios = [...DEFAULT_SCOPES];
    this.scopes = [];
    this._anchorSuppressUntil = { position: 0, state: 0, watchZone: 0 };
    this._lastRadius = 0;
  }

  websocketSubscribe(client) {
    client.subscribe(
      {
        context: "vessels.self",
        subscribe: [
          {
            path: "navigation.position",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.headingTrue",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.depth.belowKeel",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.depth.belowSurface",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.depth.belowTransducer",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.wind.directionTrue",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.wind.speedApparent",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.tide",
            period: 60 * 1000,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.position",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.state",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.watchZone",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "notifications.navigation.anchor",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
        ],
      },
    );
  }

  // Fleet subscription: the dynamic paths plus the static identity/geometry we
  // draw for every *other* vessel, keyed by the stream's per-message `context`.
  // FleetLayer still seeds static data once from REST for targets already known
  // at load, but subscribing to the static paths lets a newly-sighted vessel's
  // name/type/dimensions fill in as its (infrequent) AIS static reports arrive,
  // rather than being pinned to whatever the one-shot fetch happened to catch.
  websocketSubscribeFleet(client) {
    client.subscribe({
      context: "vessels.*",
      subscribe: [
        { path: "navigation.position", policy: "instant" },
        { path: "navigation.headingTrue", policy: "instant" },
        { path: "navigation.courseOverGroundTrue", policy: "instant" },
        { path: "navigation.speedOverGround", policy: "instant" },
        { path: "name", policy: "instant" },
        { path: "design.aisShipType", policy: "instant" },
        { path: "design.length", policy: "instant" },
        { path: "design.beam", policy: "instant" },
        { path: "sensors.ais.fromCenter", policy: "instant" },
        { path: "sensors.ais.fromBow", policy: "instant" },
      ],
    });
  }

  getPosition() {
    if (this.currentCoordinates)
      return L.latLng(
        this.currentCoordinates.value.latitude,
        this.currentCoordinates.value.longitude,
      );
    else
      return L.latLng(0, 0);
  }

  getAnchorPosition() {
    if (this.anchor.position && this.anchor.position.value)
      return L.latLng(
        this.anchor.position.value.latitude,
        this.anchor.position.value.longitude,
      );
    else
      return L.latLng(0, 0);
  }

  isAnchored() {
    return this.anchor?.state?.value === "on";
  }

  extract(tree, path, fresh = true, maxAge = DEFAULT_FRESHNESS_SEC) {
    let data = SignalKHelper.extract(tree, path);

    if (!data)
      return null;

    // check for freshness.
    if (fresh && !SignalKHelper.isFresh(data, maxAge)) {
      const ageSec = data.timestamp
        ? Math.round((Date.now() - new Date(data.timestamp).getTime()) / 1000)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKHelper.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      return null;
    }

    return data;
  }

  extractAll(data) {
    this.boatConfig = BoatConfig.extract(data);

    this.currentCoordinates = this.extract(data, "navigation.position");
    this.heading = this.extract(data, "navigation.headingTrue") ?? this.heading;
    this.belowKeel =
      this.extract(data, "environment.depth.belowKeel") ?? this.belowKeel;
    this.belowSurface =
      this.extract(data, "environment.depth.belowSurface") ?? this.belowSurface;
    this.belowTransducer =
      this.extract(data, "environment.depth.belowTransducer") ?? this.belowTransducer;
    this.twa = this.extract(data, "environment.wind.directionTrue") ?? this.twa;
    this.aws = this.extract(data, "environment.wind.speedApparent") ?? this.aws;
    this.tide = this.extract(data, "environment.tide", false) ?? this.tide;

    if (!this.anchor)
      this.anchor = {};

    if (!this._anchorSuppressed("state"))
      this.anchor.state = this.extract(data, "navigation.anchor.state", false) ?? this.anchor.state;

    // anchor.position is treated as a UI preference: the server clears it on raise,
    // but the toolbar/overlay want to keep the last set value so the next
    // drop has a sensible default.
    if (!this._anchorSuppressed("position")) {
      let newAnchorPosition = this.extract(data, "navigation.anchor.position", false) ??
        this.anchor.position;
      if (newAnchorPosition && newAnchorPosition.value == null && this.anchor.position?.value)
        newAnchorPosition.value = this.anchor.position.value;
      this.anchor.position = newAnchorPosition;
    }

    // anchor.watchZone is treated as a UI preference: the server clears it on raise,
    // but the toolbar/overlay want to keep the last set value so the next
    // drop has a sensible default.
    if (!this._anchorSuppressed("watchZone")) {
      let newWatchZone = this.extract(data, "navigation.anchor.watchZone", false);
      //keep our old one if we have it.
      if (newWatchZone && newWatchZone.value == null && this.anchor.watchZone?.value)
        newWatchZone.value = this.anchor.watchZone.value;
      this.anchor.watchZone = newWatchZone;
    }

    this.anchor.notification =
      this.extract(data, "notifications.navigation.anchor", false) ??
      this.anchor.notification;
  }

  handleDelta(timestamp, delta) {
    const path = delta.path;

    // Mutate the existing envelope so meta/$source/pgn/values populated by
    // extractAll survive delta updates. Only create a new envelope the first
    // time we see a path.
    const apply = (current) => {
      if (current) {
        current.value = delta.value;
        current.timestamp = timestamp;
        if (delta.meta)
          current.meta = delta.meta;
        return current;
      }
      return { value: delta.value, timestamp };
    };

    if (path == "navigation.position")
      this.currentCoordinates = apply(this.currentCoordinates);
    else if (path == "navigation.headingTrue")
      this.heading = apply(this.heading);
    else if (path == "environment.depth.belowKeel")
      this.belowKeel = apply(this.belowKeel);
    else if (path == "environment.depth.belowSurface")
      this.belowSurface = apply(this.belowSurface);
    else if (path == "environment.depth.belowTransducer")
      this.belowTransducer = apply(this.belowTransducer);
    else if (path == "environment.wind.directionTrue")
      this.twa = apply(this.twa);
    else if (path == "environment.wind.speedApparent")
      this.aws = apply(this.aws);
    else if (path == "environment.tide.heightHigh")
      (this.tide ??= {}).heightHigh = apply(this.tide.heightHigh);
    else if (path == "environment.tide.heightLow")
      (this.tide ??= {}).heightLow = apply(this.tide.heightLow);
    else if (path == "environment.tide.heightNow")
      (this.tide ??= {}).heightNow = apply(this.tide.heightNow);
    else if (path == "environment.tide.stationName")
      (this.tide ??= {}).stationName = apply(this.tide.stationName);
    else if (path == "environment.tide.timeHigh")
      (this.tide ??= {}).timeHigh = apply(this.tide.timeHigh);
    else if (path == "environment.tide.timeLow")
      (this.tide ??= {}).timeLow = apply(this.tide.timeLow);
    else if (path == "navigation.anchor.state") {
      if (!this._anchorSuppressed("state"))
        this.anchor.state = apply(this.anchor.state);
    }
    else if (path == "navigation.anchor.position") {
      if (delta.value != null && !this._anchorSuppressed("position"))
        this.anchor.position = apply(this.anchor.position);
    }
    else if (path == "navigation.anchor.watchZone") {
      if (delta.value != null && !this._anchorSuppressed("watchZone"))
        this.anchor.watchZone = apply(this.anchor.watchZone);
    }
    else if (path == "notifications.navigation.anchor")
      this.anchor.notification = apply(this.anchor.notification);
    // else if (!path.startsWith("notifications"))
    //   console.log(`[websocket] Ignoring: ${path}`);
  }

  // Client-initiated optimistic write into the anchor envelopes.
  // Per-key suppression is bumped only for the paths we actually touch.
  // That keeps us from blocking incoming position/state deltas from another client.
  // Only the keys present in `updates` are touched; pass `null` to clear a field.
  applyClientAnchorState(updates = {}) {
    const timestamp = new Date().toISOString();
    const expireAt = Date.now() + POST_ACTION_SETTLE_MS;

    const set = (key, value) => {
      this._anchorSuppressUntil[key] = expireAt;
      if (this.anchor[key]) {
        this.anchor[key].value = value;
        this.anchor[key].timestamp = timestamp;
      } else {
        this.anchor[key] = { value, timestamp };
      }
    };

    if ("position" in updates)
      set("position", updates.position);
    if ("state" in updates)
      set("state", updates.state);
    if ("watchZone" in updates)
      set("watchZone", updates.watchZone);
  }

  // Capture the current anchor envelopes so a failed client action can roll
  // back. Deep-cloned so subsequent in-place mutations (applyClientAnchorState,
  // cleanDisplayUnits) don't corrupt the snapshot.
  //
  // Cloned via JSON round-trip rather than structuredClone(): the latter only
  // landed in Chrome 98 and is absent on the Navico MFD engine (Chromium 69),
  // where it threw here — before the drop/raise POST was sent — and silently
  // killed both actions. Transpilation can't help; it's a missing runtime
  // global, not syntax. The envelopes are plain JSON (ISO-string timestamps,
  // primitive/object values, no Dates/Maps/functions/cycles), so this is a
  // faithful clone.
  snapshotAnchorState() {
    return JSON.parse(
      JSON.stringify({
        position: this.anchor.position ?? null,
        state: this.anchor.state ?? null,
        watchZone: this.anchor.watchZone ?? null,
      }),
    );
  }

  // Restore from a snapshot and release the suppression window so the next
  // server update can land immediately.
  restoreAnchorState(snapshot) {
    this.anchor.position = snapshot.position;
    this.anchor.state = snapshot.state;
    this.anchor.watchZone = snapshot.watchZone;
    this._anchorSuppressUntil = { position: 0, state: 0, watchZone: 0 };
  }

  // Build a WatchZone instance from current state. Used by the overlay/controls
  // factory and by AnchorController when posting drop/setZone. Falls back to a
  // default circle when the server hasn't published a zone yet (e.g., first
  // load with anchor up) so the UI always has a shape to draw.
  getWatchZone() {
    const config = this.anchor.watchZone?.value;
    if (config && typeof config === "object")
      return watchZoneFromConfig(config);
    return watchZoneFromConfig({ type: "circle", radius: 60 });
  }

  _anchorSuppressed(key) {
    return Date.now() < this._anchorSuppressUntil[key];
  }

  calculate() {
    this.cleanDisplayUnits();
    this.calculateTides();
    if (this.boatConfig)
      this.boatConfig.heading = this.computeOwnHeading();
    this.calculateScopes();
  }

  // SignalK's units-preferences plugin is sometimes buggy for me.
  // this is a workaround since we know these parameters should
  // always have these categories
  cleanDisplayUnits() {
    const override = (envelope, from, to) => {
      const du = envelope?.meta?.displayUnits;
      if (du?.category === from)
        du.category = to;
    };
    override(this.belowSurface, "distance", "depth");
    override(this.belowKeel, "distance", "depth");
    override(this.belowTransducer, "distance", "depth");
    override(this.tide?.heightLow, "distance", "depth");
    override(this.tide?.heightHigh, "distance", "depth");
    override(this.tide?.heightNow, "distance", "depth");
  }

  calculateTides() {
    if (
      !this.tide ||
      !this.tide.timeLow ||
      !this.tide.heightLow ||
      !this.tide.timeHigh ||
      !this.tide.heightHigh
    )
      return;

    this.currentTide = GeoMath.estimateTideHeightSmooth(
      this.tide.timeLow.value,
      this.tide.heightLow.value,
      this.tide.timeHigh.value,
      this.tide.heightHigh.value,
    );

    this.tidalRise = this.tide.heightHigh.value - this.currentTide;
    this.tidalFall = this.currentTide - this.tide.heightLow.value;
  }

  // Set which scope ratios to calculate from a user-supplied value (the
  // plugin's comma-separated `scopes` config, or an array). Fault tolerant:
  // invalid/out-of-range entries are dropped and the defaults are used if
  // nothing usable remains. See shared/scopes.js.
  setScopeRatios(input) {
    this.scopeRatios = parseScopes(input);
  }

  // Produce one {ratio, length} entry per configured ratio, highest→lowest.
  calculateScopes() {
    this.scopes = this.scopeRatios.map((ratio) => ({
      ratio,
      length: this.calculateScope(ratio),
    }));
  }

  calculateScope(scope) {
    if (!this.belowSurface || !this.boatConfig)
      return 0;
    let maxHeight = this.belowSurface.value;
    maxHeight += this.boatConfig.anchorRollerHeight; // height of the bow roller
    maxHeight += this.tidalRise; // delta to high tide
    return maxHeight * scope;
  }

  getAnchorEstimate() {
    const boatConfig = this.boatConfig;
    // Cap the estimate at the chain we actually carry — the anchor can't be
    // further from the bow than our rode.
    const distance = Math.min(
      this.calculateScope(5),
      boatConfig.totalAnchorChainLength,
    );

    let radius = distance + boatConfig.loa * 2;
    radius = Math.round(radius / 5) * 5;
    radius = Math.max(0, radius);
    radius = Math.min(200, radius);

    return { distance, radius };
  }

  getDefaultRadius() {
    const currentRadius = Number(this.anchor?.watchZone?.value?.radius);
    const estimatedRadius = Number(this.getAnchorEstimate()?.radius);

    let radius = 60;

    if (Number.isFinite(currentRadius) && currentRadius > 0)
      radius = currentRadius;
    else if (Number.isFinite(this._lastRadius) && this._lastRadius > 0)
      radius = this._lastRadius;
    else if (Number.isFinite(estimatedRadius) && estimatedRadius > 0)
      radius = estimatedRadius;

    this._lastRadius = radius;

    return radius;
  }

  // Heading priority:
  // SignalK headingTrue
  // bearing-to-anchor (if dropped)
  // last-known TWA
  // 0
  computeOwnHeading() {
    if (this.heading)
      return radiansToDegrees(this.heading.value);

    if (
      this.anchor.position &&
      this.anchor.position.value &&
      this.currentCoordinates
    ) {
      return Math.round(
        bearingToAzimuth(
          turfBearing(
            point([
              this.currentCoordinates.value.longitude,
              this.currentCoordinates.value.latitude,
            ]),
            point([
              this.anchor.position.value.longitude,
              this.anchor.position.value.latitude,
            ]),
          ),
        ),
      );
    }

    if (this.twa)
      return radiansToDegrees(this.twa.value);

    return 0;
  }
}
