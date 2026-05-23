import { WatchZone } from "./WatchZone.js";
import { deg2rad, rad2deg, haversineDistance, EARTH_RADIUS_METERS } from "../geo/distance.js";

const DEFAULT_RADIUS_METERS = 60;

export class CircleZone extends WatchZone {
  constructor(config = {}) {
    super(config);
    const r = Number(config.radius);
    this.radius = Number.isFinite(r) && r > 0 ? r : DEFAULT_RADIUS_METERS;
  }

  getType() {
    return "circle";
  }

  getConfig() {
    return { type: "circle", radius: this.radius };
  }

  getCircleRadius() {
    return this.radius;
  }

  contains(vesselPosition, anchorPosition) {
    if (!vesselPosition || !anchorPosition)
      return true;
    const d = haversineDistance(
      vesselPosition.latitude, vesselPosition.longitude,
      anchorPosition.latitude, anchorPosition.longitude,
    );
    return d <= this.radius;
  }

  getBoundingBox(anchorPosition) {
    // Spherical-earth offsets: dLat is uniform, dLon scales by cos(latitude).
    // Degenerate near the poles, but fine for any realistic anchorage.
    const dLat = rad2deg(this.radius / EARTH_RADIUS_METERS);
    const cosLat = Math.cos(deg2rad(anchorPosition.latitude));
    const dLon = rad2deg(this.radius / (EARTH_RADIUS_METERS * (cosLat || 1)));
    return {
      latMin: anchorPosition.latitude - dLat,
      latMax: anchorPosition.latitude + dLat,
      lonMin: anchorPosition.longitude - dLon,
      lonMax: anchorPosition.longitude + dLon,
    };
  }
}
