import { WatchZone } from "./WatchZone.js";
import {
  bearing as turfBearing,
  bearingToAzimuth,
  distance,
  destination,
  point,
} from "@turf/turf";

const DEFAULT_RADIUS_METERS = 60;
// North-centered, 120° wide. Used only when a config arrives with missing /
// invalid angle fields. The UI computes a heading-aware default before
// posting, so this fallback is for malformed payloads, not the common path.
const DEFAULT_START_ANGLE = 300;
const DEFAULT_END_ANGLE = 60;

export class SectorZone extends WatchZone {
  constructor(config = {}) {
    super(config);
    const r = Number(config.radius);
    this.radius = Number.isFinite(r) && r > 0 ? r : DEFAULT_RADIUS_METERS;
    const s = Number(config.startAngle);
    const e = Number(config.endAngle);
    this.startAngle = Number.isFinite(s) ? bearingToAzimuth(s) : DEFAULT_START_ANGLE;
    this.endAngle = Number.isFinite(e) ? bearingToAzimuth(e) : DEFAULT_END_ANGLE;
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
    const anchorPt = point([anchorPosition.longitude, anchorPosition.latitude]);
    const vesselPt = point([vesselPosition.longitude, vesselPosition.latitude]);
    const d = distance(vesselPt, anchorPt, { units: "meters" });
    if (d > this.radius)
      return false;
    const b = bearingToAzimuth(turfBearing(anchorPt, vesselPt));
    const arcWidth = (this.endAngle - this.startAngle + 360) % 360;
    const offset = (b - this.startAngle + 360) % 360;
    return offset <= arcWidth;
  }

  getBoundingBox(anchorPosition) {
    // Loose circle bounding box. Tightening to the actual sector wedge is
    // possible but adds geometry for no visible payoff at fitBounds scale.
    const center = point([anchorPosition.longitude, anchorPosition.latitude]);
    const opts = { units: "meters" };
    const n = destination(center, this.radius, 0, opts).geometry.coordinates;
    const e = destination(center, this.radius, 90, opts).geometry.coordinates;
    const s = destination(center, this.radius, 180, opts).geometry.coordinates;
    const w = destination(center, this.radius, 270, opts).geometry.coordinates;
    return { latMin: s[1], latMax: n[1], lonMin: w[0], lonMax: e[0] };
  }
}
