// Critical bow/anchor geometry shared by the UI (AnchorOverlay draws the
// bow→anchor line and its distance/bearing labels; AppState/AnchorController
// place the drop estimate) and the backend plugin (updateAnchorState publishes
// the SignalK anchor deltas). Kept in one place so the distance and bearing
// math can never drift between what the map draws and what we publish to
// Signal K. Depends only on @turf/turf, which both the Node plugin and the
// browser bundle already carry.
//
// Positions are plain { latitude, longitude } objects (Signal K's native
// shape). Callers holding a Leaflet L.latLng translate at the boundary.

import {
  bearing as turfBearing,
  bearingToAzimuth,
  destination,
  distance,
  point,
} from "@turf/turf";

// Normalize any angle in degrees to the [0, 360) range.
export function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

export class Geo {
  // Translate a GPS antenna position to the vessel's bow using the heading
  // (degrees true) and the GPS→bow offsets in meters: yOffset forward along
  // the heading, then xOffset abeam (from the centerline). Returns the bow as
  // a { latitude, longitude } object.
  static bowPosition({ latitude, longitude }, heading, xOffset = 0, yOffset = 0) {
    const opts = { units: "meters" };
    let pt = destination(point([longitude, latitude]), yOffset, heading, opts);
    if (xOffset != 0)
      pt = destination(pt, xOffset, heading - 90, opts);
    const [lon, lat] = pt.geometry.coordinates;
    return { latitude: lat, longitude: lon };
  }

  // Great-circle distance in meters between two { latitude, longitude } points.
  static distance(from, to) {
    return distance(
      point([from.longitude, from.latitude]),
      point([to.longitude, to.latitude]),
      { units: "meters" },
    );
  }

  // True bearing as a compass azimuth in degrees [0, 360) from `from` to `to`.
  static bearingTrue(from, to) {
    return bearingToAzimuth(
      turfBearing(
        point([from.longitude, from.latitude]),
        point([to.longitude, to.latitude]),
      ),
    );
  }

  // Apparent (relative) bearing in degrees [0, 360), measured clockwise from
  // the vessel's bow: the true bearing minus the vessel heading.
  static apparentBearing(trueBearing, heading) {
    return normalizeDegrees(trueBearing - heading);
  }
}
