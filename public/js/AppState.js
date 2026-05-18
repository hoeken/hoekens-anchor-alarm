// AppState is our single source of truth for the current state of the application.

import { SignalKClient } from "./SignalKClient.js";
import { BoatConfig } from "./BoatConfig.js";
import { GeoMath } from "./GeoMath.js";

const DEFAULT_FRESHNESS_SEC = 300;

export class AppState {
  constructor() {}

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
    let data = SignalKClient.extract(tree, path);

    if (!data) return null;

    // check for freshness.
    if (fresh && !SignalKClient.isFresh(data, maxAge)) {
      const ageSec = data.timestamp
        ? Math.round((Date.now() - new Date(data.timestamp).getTime()) / 1000)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKClient.errorHandler?.(msg);
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
