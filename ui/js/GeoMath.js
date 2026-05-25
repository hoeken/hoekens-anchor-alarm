import { deg2rad, rad2deg, haversineDistance, bearing } from "../../shared/geo/distance.js";

export class GeoMath {
  static deg2rad(deg) {
    return deg2rad(deg);
  }

  // Convert radians to degrees
  static rad2deg(radians) {
    return rad2deg(radians);
  }

  static normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }

  /**
   * Returns the length of the vector (x, y) from the origin.
   * @param {number} x – x-coordinate
   * @param {number} y – y-coordinate
   * @returns {number} distance from (0,0) to (x,y)
   */
  static calculateVectorDistance(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    return haversineDistance(lat1, lon1, lat2, lon2);
  }

  static calculateBearing(lat1, lon1, lat2, lon2) {
    return bearing(lat1, lon1, lat2, lon2);
  }

  /**
   * Calculates the destination point given starting latitude and longitude,
   * bearing, and distance using the haversine formula.
   *
   * @param {number} lat1 - Starting latitude in degrees.
   * @param {number} lon1 - Starting longitude in degrees.
   * @param {number} bearing - Bearing in degrees (clockwise from north).
   * @param {number} distance - Distance to travel from the starting point in meters.
   * @returns {{ latitude: number, longitude: number }} - The destination latitude and longitude.
   */
  static calculateDestinationPoint(lat1, lon1, bearing, distance) {
    const R = 6371e3; // Earth's radius in meters

    // Convert input values to radians
    const φ1 = (lat1 * Math.PI) / 180;
    const λ1 = (lon1 * Math.PI) / 180;
    const θ = (bearing * Math.PI) / 180;
    const δ = distance / R; // Angular distance in radians

    // Calculate destination coordinates
    const sinφ1 = Math.sin(φ1);
    const cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ);
    const cosδ = Math.cos(δ);
    const sinθ = Math.sin(θ);
    const cosθ = Math.cos(θ);

    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
    const φ2 = Math.asin(sinφ2);

    const y = sinθ * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);

    // Convert radians back to degrees
    const lat2 = (φ2 * 180) / Math.PI;
    const lon2 = (((λ2 * 180) / Math.PI + 540) % 360) - 180; // Normalize to [-180, +180]

    return { latitude: lat2, longitude: lon2 };
  }

  static calculateBowCoordinates(current, heading, xOffset, yOffset) {
    //first do our Y along our heading.
    let bc = GeoMath.calculateDestinationPoint(
      current.lat,
      current.lng,
      heading,
      yOffset,
    );

    //then do our X at 90 degrees.
    if (xOffset != 0)
      bc = GeoMath.calculateDestinationPoint(
        bc.latitude,
        bc.longitude,
        heading - 90,
        xOffset,
      );

    //okay use the new bow coordinates
    return L.latLng(bc.latitude, bc.longitude);
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
