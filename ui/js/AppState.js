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
    else return L.latLng(0, 0);
  }

  getAnchorPosition() {
    if (this.anchor.position && this.anchor.position.value)
      return L.latLng(
        this.anchor.position.value.latitude,
        this.anchor.position.value.longitude,
      );
    else return L.latLng(0, 0);
  }

  extract(tree, path, fresh = true, maxAge = DEFAULT_FRESHNESS_SEC) {
    let data = SignalKHelper.extract(tree, path);

    if (!data) return null;

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

    if (!this.anchor) this.anchor = {};
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
    // console.log(delta);
    let data = null;
    const path = delta.path;
    if (path == "navigation.position") data = this.currentCoordinates;
    else if (path == "navigation.headingTrue") data = this.heading;
    else if (path == "environment.depth.belowKeel") data = this.belowKeel;
    else if (path == "environment.depth.belowSurface") data = this.belowSurface;
    else if (path == "environment.wind.directionTrue") data = this.twa;
    else if (path == "environment.wind.speedApparent") data = this.aws;
    else if (path == "environment.tide") data = this.tide;
    else if (path == "navigation.anchor.position") data = this.anchor.position;
    else if (path == "navigation.anchor.state") data = this.anchor.state;
    else if (path == "navigation.anchor.maxRadius")
      data = this.anchor.maxRadius;
    else if (path == "notifications.navigation.anchor")
      data = this.anchor.notification;
    else console.log(delta);

    if (data) {
      data.timestamp = timestamp;
      data.value = delta.value;
    }
  }

  calculate() {
    this.calculateTides();
    this.boatConfig.heading = this.computeOwnHeading();
    this.calculateScopes();
  }

  calculateTides() {
    if (!this.tide) return;

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
    if (this.heading) return GeoMath.rad2deg(this.heading.value);

    if (this.anchorPosition && this.currentCoordinates) {
      return Math.round(
        GeoMath.calculateBearing(
          this.currentCoordinates.value.latitude,
          this.currentCoordinates.value.longitude,
          this.anchorPosition.value.latitude,
          this.anchorPosition.value.longitude,
        ),
      );
    }

    if (this.twa) return GeoMath.rad2deg(this.twa.value);

    return 0;
  }
}
