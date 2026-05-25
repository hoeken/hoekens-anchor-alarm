import { WatchZone } from "./WatchZone.js";
import {
  bearing,
  deg2rad,
  rad2deg,
  haversineDistance,
  EARTH_RADIUS_METERS,
} from "../geo/distance.js";

const DEFAULT_RADIUS_METERS = 60;
// North-centered, 120° wide. Used only when a config arrives with missing /
// invalid angle fields. The UI computes a heading-aware default before
// posting, so this fallback is for malformed payloads, not the common path.
const DEFAULT_START_ANGLE = 300;
const DEFAULT_END_ANGLE = 60;

function normalizeAngle(a) {
  return ((a % 360) + 360) % 360;
}

export class SectorZone extends WatchZone {
  constructor(config = {}) {
    super(config);
    const r = Number(config.radius);
    this.radius = Number.isFinite(r) && r > 0 ? r : DEFAULT_RADIUS_METERS;
    const s = Number(config.startAngle);
    const e = Number(config.endAngle);
    this.startAngle = Number.isFinite(s) ? normalizeAngle(s) : DEFAULT_START_ANGLE;
    this.endAngle = Number.isFinite(e) ? normalizeAngle(e) : DEFAULT_END_ANGLE;
  }

  getType() {
    return "sector";
  }

  getConfig() {
    return {
      type: "sector",
      radius: this.radius,
      startAngle: this.startAngle,
      endAngle: this.endAngle,
    };
  }

  // Sector zones still advertise a circle-equivalent radius so external
  // SignalK consumers (Freeboard, the legacy navigation.anchor.meta.zones
  // array) keep working. Our own alarm uses contains() with the real
  // geometry; the legacy radius is a conservative outer bound.
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
    if (d > this.radius)
      return false;
    const b = bearing(
      anchorPosition.latitude, anchorPosition.longitude,
      vesselPosition.latitude, vesselPosition.longitude,
    );
    const arcWidth = (this.endAngle - this.startAngle + 360) % 360;
    const offset = (b - this.startAngle + 360) % 360;
    return offset <= arcWidth;
  }

  getBoundingBox(anchorPosition) {
    // Loose circle bounding box. Tightening to the actual sector wedge is
    // possible but adds geometry for no visible payoff at fitBounds scale.
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
