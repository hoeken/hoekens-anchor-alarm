// AppState is our single source of truth for the current state of the application.

import { SignalKHelper } from "./SignalKHelper.js";
import { BoatConfig } from "./BoatConfig.js";
import { GeoMath } from "./GeoMath.js";

const DEFAULT_FRESHNESS_SEC = 300;

const DELTA_FAST_SPEED = 250;
const DELTA_SLOW_SPEED = 1000;

export class AppState {
  constructor() {
    this.anchor = {};
    this.tidalRise = 0;
    this.tidalFall = 0;
    this.scope7 = 0;
    this.scope5 = 0;
    this.scope4 = 0;
    this.scope3 = 0;
  }

  websocketSubscribe(client) {
    client.subscribe([
      {
        context: "vessels.self",
        subscribe: [
          {
            path: "navigation.position",
            policy: "fixed",
            period: DELTA_FAST_SPEED,
          },
          {
            path: "navigation.headingTrue",
            policy: "fixed",
            period: DELTA_FAST_SPEED,
          },
          {
            path: "environment.depth.belowKeel",
            policy: "fixed",
            period: DELTA_SLOW_SPEED,
          },
          {
            path: "environment.depth.belowSurface",
            policy: "fixed",
            period: DELTA_SLOW_SPEED,
          },
          {
            path: "environment.wind.directionTrue",
            policy: "fixed",
            period: DELTA_SLOW_SPEED,
          },
          {
            path: "environment.wind.speedApparent",
            policy: "fixed",
            period: DELTA_SLOW_SPEED,
          },
          {
            path: "environment.tide",
            policy: "instant",
            minPeriod: 60 * 1000,
          },
          {
            path: "navigation.anchor.position",
            policy: "instant",
            minPeriod: DELTA_FAST_SPEED,
          },
          {
            path: "navigation.anchor.state",
            policy: "instant",
            minPeriod: DELTA_FAST_SPEED,
          },
          {
            path: "navigation.anchor.maxRadius",
            policy: "instant",
            minPeriod: DELTA_FAST_SPEED,
          },
          {
            path: "notifications.navigation.anchor",
            policy: "instant",
            minPeriod: DELTA_FAST_SPEED,
          },
        ],
      },
    ]);
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
    this.anchor.position =
      this.extract(data, "navigation.anchor.position", false) ??
      this.anchor.position;
    this.anchor.state =
      this.extract(data, "navigation.anchor.state", false) ?? this.anchor.state;
    this.anchor.maxRadius =
      this.extract(data, "navigation.anchor.maxRadius", false) ??
      this.anchor.maxRadius;
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
    else if (path == "navigation.anchor.position")
      this.anchor.position = apply(this.anchor.position);
    else if (path == "navigation.anchor.state")
      this.anchor.state = apply(this.anchor.state);
    else if (path == "navigation.anchor.maxRadius")
      this.anchor.maxRadius = apply(this.anchor.maxRadius);
    else if (path == "notifications.navigation.anchor")
      this.anchor.notification = apply(this.anchor.notification);
    else if (!path.startsWith("notifications"))
      console.log(`[websocket] Ignoring: ${path}`);
  }

  calculate() {
    this.calculateTides();
    if (this.boatConfig)
      this.boatConfig.heading = this.computeOwnHeading();
    this.calculateScopes();
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
