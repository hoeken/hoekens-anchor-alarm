import { WatchZone } from "./WatchZone.js";
import { distance, destination, point } from "@turf/turf";

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
    const d = distance(
      point([vesselPosition.longitude, vesselPosition.latitude]),
      point([anchorPosition.longitude, anchorPosition.latitude]),
      { units: "meters" },
    );
    return d <= this.radius;
  }

  getBoundingBox(anchorPosition) {
    // Cardinal-direction destinations at zone radius give exact lat/lon
    // extents on the WGS84 sphere — turf.destination handles the math.
    const center = point([anchorPosition.longitude, anchorPosition.latitude]);
    const opts = { units: "meters" };
    const n = destination(center, this.radius, 0, opts).geometry.coordinates;
    const e = destination(center, this.radius, 90, opts).geometry.coordinates;
    const s = destination(center, this.radius, 180, opts).geometry.coordinates;
    const w = destination(center, this.radius, 270, opts).geometry.coordinates;
    return { latMin: s[1], latMax: n[1], lonMin: w[0], lonMax: e[0] };
  }
}
