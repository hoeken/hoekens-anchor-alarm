import { Geo } from "../../shared/geo.js";

export class GeoMath {
  // Translates a GPS position to the boat's bow using the heading and the
  // configured GPS→bow offsets. Delegates to the shared Geo.bowPosition so the
  // map and the backend compute the bow identically; wraps the result in an
  // L.latLng so callers can hand it straight to Leaflet.
  static calculateBowCoordinates(current, heading, xOffset, yOffset) {
    const { latitude, longitude } = Geo.bowPosition(
      { latitude: current.lat, longitude: current.lng },
      heading,
      xOffset,
      yOffset,
    );
    return L.latLng(latitude, longitude);
  }

  /**
   * Estimate current tide height with sinusoidal easing
   *
   * @param {Date|string|number} lowTime      — time of low tide
   * @param {number}            lowHeight    — height at low tide
   * @param {Date|string|number} highTime     — time of high tide
   * @param {number}            highHeight   — height at high tide
   * @param {Date|string|number} [currentTime=new Date()] — time to estimate
   * @returns {number} smoothly interpolated tide height
   */
  static estimateTideHeightSmooth(
    lowTime,
    lowHeight,
    highTime,
    highHeight,
    currentTime = new Date(),
  ) {
    // normalize inputs to UTC timestamps
    const tLow = (
      lowTime instanceof Date ? lowTime : new Date(lowTime)
    ).getTime();
    const tHigh = (
      highTime instanceof Date ? highTime : new Date(highTime)
    ).getTime();
    const tCurrent = (
      currentTime instanceof Date ? currentTime : new Date(currentTime)
    ).getTime();

    let t0, h0, t1, h1;

    // determine rising vs falling tide
    if (tLow < tHigh) {
      // rising: low → high
      if (tCurrent <= tLow) {
        // extrapolate previous high tide one half-period before the known low
        t0 = tLow - (tHigh - tLow);
        h0 = highHeight;
        t1 = tLow;
        h1 = lowHeight;
      } else if (tCurrent >= tHigh) {
        // extrapolate next low tide one half-period after the known high
        t0 = tHigh;
        h0 = highHeight;
        t1 = tHigh + (tHigh - tLow);
        h1 = lowHeight;
      } else {
        t0 = tLow;
        h0 = lowHeight;
        t1 = tHigh;
        h1 = highHeight;
      }
    } else {
      // falling: high → low
      if (tCurrent <= tHigh) {
        // extrapolate previous low tide one half-period before the known high
        t0 = tHigh - (tLow - tHigh);
        h0 = lowHeight;
        t1 = tHigh;
        h1 = highHeight;
      } else if (tCurrent >= tLow) {
        // extrapolate next high tide one half-period after the known low
        t0 = tLow;
        h0 = lowHeight;
        t1 = tLow + (tLow - tHigh);
        h1 = highHeight;
      } else {
        t0 = tHigh;
        h0 = highHeight;
        t1 = tLow;
        h1 = lowHeight;
      }
    }

    // fraction through the tide interval [0…1]
    const frac = (tCurrent - t0) / (t1 - t0);

    // sinusoidal easing: starts slow, speeds up, then slows into the end
    const sineFrac = (1 - Math.cos(Math.PI * frac)) / 2;

    // interpolated height
    const result = h0 + (h1 - h0) * sineFrac;

    return result;
  }
}
