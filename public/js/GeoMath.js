class GeoMath {
  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Convert radians to degrees
  static rad2deg(radians) {
    return (radians * 180) / Math.PI;
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
    let R = 6371000; // Radius of the earth in m
    let dLat = GeoMath.deg2rad(lat2 - lat1);
    let dLon = GeoMath.deg2rad(lon2 - lon1);
    let a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(GeoMath.deg2rad(lat1)) *
        Math.cos(GeoMath.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c; // Distance in m
    return d;
  }

  static calculateBearing(lat1, lon1, lat2, lon2) {
    // Convert latitude and longitude from degrees to radians
    var θa = GeoMath.deg2rad(lat1);
    var θb = GeoMath.deg2rad(lat2);
    var ΔL = GeoMath.deg2rad(lon2 - lon1);

    // Calculate X and Y using the provided formulas
    var X = Math.cos(θb) * Math.sin(ΔL);
    var Y =
      Math.cos(θa) * Math.sin(θb) - Math.sin(θa) * Math.cos(θb) * Math.cos(ΔL);

    // Calculate the initial bearing (β) in radians
    var β = Math.atan2(X, Y);

    // Convert the bearing from radians to degrees
    var bearing = GeoMath.rad2deg(β);

    // Normalize the bearing to be between 0° and 360°
    bearing = (bearing + 360) % 360;

    return bearing;
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
