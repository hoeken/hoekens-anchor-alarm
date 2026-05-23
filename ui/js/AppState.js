// AppState is our single source of truth for the current state of the application.

import { SignalKHelper } from "./SignalKHelper.js";
import { BoatConfig } from "./BoatConfig.js";
import { GeoMath } from "./GeoMath.js";

const DEFAULT_FRESHNESS_SEC = 300;

const DELTA_FAST_SPEED = 250;
const DELTA_SLOW_SPEED = 1000;

// Window after a client-initiated anchor change during which incoming server
// updates for anchor.position/state/maxRadius are ignored. Covers in-flight
// polls whose response was computed before the server processed our request,
// and the brief gap before the matching websocket delta arrives.
export const POST_ACTION_SETTLE_MS = 3000;

export class AppState {
  constructor() {
    this.anchor = {};
    this.tidalRise = 0;
    this.tidalFall = 0;
    this.scope7 = 0;
    this.scope5 = 0;
    this.scope4 = 0;
    this.scope3 = 0;
    this._anchorSuppressUntil = 0;
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
            minPeriod: 60 * 1000,
            format: "full",
            policy: "instant",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.position",
            minPeriod: DELTA_FAST_SPEED,
            format: "full",
            policy: "instant",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.state",
            minPeriod: DELTA_FAST_SPEED,
            format: "full",
            policy: "instant",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.maxRadius",
            minPeriod: DELTA_FAST_SPEED,
            format: "full",
            policy: "instant",
            sendMeta: "all",
          },
          {
            path: "notifications.navigation.anchor",
            minPeriod: DELTA_FAST_SPEED,
            format: "full",
            policy: "instant",
            sendMeta: "all",
          },
        ],
      },
    );
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

  // True when either the position is set or the server-side anchor.state is
  // "on". OR'd to err toward "alarm is active" if the two ever diverge.
  isAnchored() {
    return (
      !!this.anchor.position?.value ||
      this.anchor.state?.value === "on"
    );
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
    this.twa = this.extract(data, "environment.wind.directionTrue") ?? this.twa;
    this.aws = this.extract(data, "environment.wind.speedApparent") ?? this.aws;
    this.tide = this.extract(data, "environment.tide", false) ?? this.tide;

    if (!this.anchor)
      this.anchor = {};
    if (!this._anchorUpdatesSuppressed()) {
      this.anchor.position =
        this.extract(data, "navigation.anchor.position", false) ??
        this.anchor.position;
      this.anchor.state =
        this.extract(data, "navigation.anchor.state", false) ?? this.anchor.state;
      this.anchor.maxRadius =
        this.extract(data, "navigation.anchor.maxRadius", false) ??
        this.anchor.maxRadius;
    }
    this.anchor.notification =
      this.extract(data, "notifications.navigation.anchor", false) ??
      this.anchor.notification;
  }

  handleDelta(timestamp, delta) {
    const path = delta.path;

    if (delta.meta) {
      console.log(delta);
    }

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
    else if (path == "navigation.anchor.position") {
      if (!this._anchorUpdatesSuppressed())
        this.anchor.position = apply(this.anchor.position);
    }
    else if (path == "navigation.anchor.state") {
      if (!this._anchorUpdatesSuppressed())
        this.anchor.state = apply(this.anchor.state);
    }
    else if (path == "navigation.anchor.maxRadius") {
      if (!this._anchorUpdatesSuppressed())
        this.anchor.maxRadius = apply(this.anchor.maxRadius);
    }
    else if (path == "notifications.navigation.anchor")
      this.anchor.notification = apply(this.anchor.notification);
    else if (!path.startsWith("notifications"))
      console.log(`[websocket] Ignoring: ${path}`);
  }

  // Client-initiated optimistic write into the anchor envelopes. Bumps the
  // suppression timestamp so any in-flight server response or delta for the
  // anchor paths is ignored until POST_ACTION_SETTLE_MS has elapsed. Only the
  // keys present in `updates` are touched; pass `null` to clear a field.
  applyClientAnchorState(updates = {}) {
    const timestamp = new Date().toISOString();
    this._anchorSuppressUntil = Date.now() + POST_ACTION_SETTLE_MS;

    const set = (key, value) => {
      if (this.anchor[key]) {
        this.anchor[key].value = value;
        this.anchor[key].timestamp = timestamp;
      } else {
        this.anchor[key] = { value, timestamp };
      }
    };

    if ("position" in updates)
      set("position", updates.position);
    if ("maxRadius" in updates)
      set("maxRadius", updates.maxRadius);
    if ("state" in updates)
      set("state", updates.state);
  }

  // Capture the current anchor envelopes so a failed client action can roll
  // back. Deep-cloned so subsequent in-place mutations (applyClientAnchorState,
  // cleanDisplayUnits) don't corrupt the snapshot.
  snapshotAnchorState() {
    return structuredClone({
      position: this.anchor.position ?? null,
      maxRadius: this.anchor.maxRadius ?? null,
      state: this.anchor.state ?? null,
    });
  }

  // Restore from a snapshot and release the suppression window so the next
  // server update can land immediately.
  restoreAnchorState(snapshot) {
    this.anchor.position = snapshot.position;
    this.anchor.maxRadius = snapshot.maxRadius;
    this.anchor.state = snapshot.state;
    this._anchorSuppressUntil = 0;
  }

  _anchorUpdatesSuppressed() {
    return Date.now() < this._anchorSuppressUntil;
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
    override(this.tide?.heightLow, "distance", "depth");
    override(this.tide?.heightHigh, "distance", "depth");
    override(this.tide?.heightNow, "distance", "depth");
    override(this.anchor?.maxRadius, "distance", "length");
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

  calculateScopes() {
    this.scope7 = this.calculateScope(7);
    this.scope5 = this.calculateScope(5);
    this.scope4 = this.calculateScope(4);
    this.scope3 = this.calculateScope(3);
  }

  calculateScope(scope) {
    if (!this.belowSurface || !this.boatConfig)
      return 0;
    let maxHeight = this.belowSurface.value;
    maxHeight += this.boatConfig.anchorRollerHeight; // height of the bow roller
    maxHeight += this.tidalRise; // delta to high tide
    return maxHeight * scope;
  }

  // Heading priority:
  // SignalK headingTrue
  // bearing-to-anchor (if dropped)
  // last-known TWA
  // 0
  computeOwnHeading() {
    if (this.heading)
      return GeoMath.rad2deg(this.heading.value);

    if (
      this.anchor.position &&
      this.anchor.position.value &&
      this.currentCoordinates
    ) {
      return Math.round(
        GeoMath.calculateBearing(
          this.currentCoordinates.value.latitude,
          this.currentCoordinates.value.longitude,
          this.anchor.position.value.latitude,
          this.anchor.position.value.longitude,
        ),
      );
    }

    if (this.twa)
      return GeoMath.rad2deg(this.twa.value);

    return 0;
  }
}
