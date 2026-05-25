import { WatchZone } from "./WatchZone.js";
import {
  bearing as initialBearing,
  deg2rad,
  rad2deg,
  haversineDistance,
  EARTH_RADIUS_METERS,
} from "../geo/distance.js";
import {
  booleanPointInPolygon,
  kinks,
  point,
  polygon as turfPolygon,
} from "@turf/turf";

export const MIN_VERTICES = 3;
export const MAX_VERTICES = 24;

function normalizeAngle(a) {
  return ((a % 360) + 360) % 360;
}

// Flat-earth projection of a {bearing, distance} vertex to local x/y meters.
// Used for turf's planar geometry checks (point-in-polygon, kinks). The
// projection is anchor-centered so turf never needs to see lat/lng.
function project(v) {
  const θ = deg2rad(v.bearing);
  return [Math.sin(θ) * v.distance, Math.cos(θ) * v.distance];
}

function sanitizeVertices(raw) {
  if (!Array.isArray(raw))
    return [];
  const out = [];
  for (const v of raw) {
    const b = Number(v?.bearing);
    const d = Number(v?.distance);
    if (!Number.isFinite(b) || !Number.isFinite(d) || d <= 0)
      continue;
    out.push({ bearing: normalizeAngle(b), distance: d });
    if (out.length >= MAX_VERTICES)
      break;
  }
  return out;
}

export class PolygonZone extends WatchZone {
  constructor(config = {}) {
    super(config);
    this.vertices = sanitizeVertices(config.vertices);
  }

  getType() {
    return "polygon";
  }

  getConfig() {
    return {
      type: "polygon",
      vertices: this.vertices.map((v) => ({ bearing: v.bearing, distance: v.distance })),
    };
  }

  // External SignalK consumers (Freeboard, legacy maxRadius) only understand
  // a circle. Report the farthest vertex as a conservative outer bound.
  getCircleRadius() {
    if (!this.vertices.length)
      return 0;
    let max = 0;
    for (const v of this.vertices)
      if (v.distance > max)
        max = v.distance;
    return max;
  }

  contains(vesselPosition, anchorPosition) {
    if (!vesselPosition || !anchorPosition)
      return true;
    // Fewer than 3 vertices is a degenerate "no polygon yet" state — treat
    // as open zone so the alarm doesn't fire on an unfinished shape.
    if (this.vertices.length < MIN_VERTICES)
      return true;
    const b = initialBearing(
      anchorPosition.latitude, anchorPosition.longitude,
      vesselPosition.latitude, vesselPosition.longitude,
    );
    const d = haversineDistance(
      anchorPosition.latitude, anchorPosition.longitude,
      vesselPosition.latitude, vesselPosition.longitude,
    );
    const vesselPoint = project({ bearing: b, distance: d });
    const ring = this.vertices.map(project);
    ring.push(ring[0]);
    return booleanPointInPolygon(point(vesselPoint), turfPolygon([ring]));
  }

  getBoundingBox(anchorPosition) {
    if (!anchorPosition || !this.vertices.length) {
      const lat = anchorPosition?.latitude ?? 0;
      const lon = anchorPosition?.longitude ?? 0;
      return { latMin: lat, latMax: lat, lonMin: lon, lonMax: lon };
    }
    // Flat-earth projection of each vertex back to lat/lng to find extremes.
    // Same approximation used in SectorZone — fine at anchorage scale.
    const cosLat = Math.cos(deg2rad(anchorPosition.latitude)) || 1;
    let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
    for (const v of this.vertices) {
      const θ = deg2rad(v.bearing);
      const dLat = rad2deg((v.distance * Math.cos(θ)) / EARTH_RADIUS_METERS);
      const dLon = rad2deg((v.distance * Math.sin(θ)) / (EARTH_RADIUS_METERS * cosLat));
      const lat = anchorPosition.latitude + dLat;
      const lon = anchorPosition.longitude + dLon;
      if (lat < latMin)
        latMin = lat;
      if (lat > latMax)
        latMax = lat;
      if (lon < lonMin)
        lonMin = lon;
      if (lon > lonMax)
        lonMax = lon;
    }
    return { latMin, latMax, lonMin, lonMax };
  }
}

// Returns true when the given vertex list forms a simple (non-self-intersecting)
// polygon. Exposed so the overlay can validate proposed drags before committing.
export function verticesAreSimple(vertices) {
  if (!Array.isArray(vertices) || vertices.length < MIN_VERTICES)
    return false;
  const ring = vertices.map(project);
  ring.push(ring[0]);
  const result = kinks(turfPolygon([ring]));
  return result.features.length === 0;
}

// Flat-earth projection helper shared with the overlay's clamp logic.
export function projectVertex(v) {
  return project(v);
}
