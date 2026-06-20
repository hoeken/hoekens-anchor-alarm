// Shared fixtures and helpers for watch-zone tests.
import { destination, distance, point } from "@turf/turf";

// A realistic anchorage position. The exact spot is irrelevant — every test
// places the vessel relative to it with vesselAt() — but using a non-equator,
// non-zero location guards against bugs that only show up away from (0, 0).
export const ANCHOR = { latitude: 37.8, longitude: -122.4 };

// Returns a { latitude, longitude } a precise distance (meters) and compass
// bearing (degrees, 0 = north) away from the given anchor. Built on the same
// turf primitives the zones use, so "place the boat 70 m due north" is exact
// rather than an eyeballed lat/lon delta.
export function vesselAt(anchor, meters, bearingDeg) {
  const [longitude, latitude] = destination(
    point([anchor.longitude, anchor.latitude]),
    meters,
    bearingDeg,
    { units: "meters" },
  ).geometry.coordinates;
  return { latitude, longitude };
}

// Great-circle distance in meters between two { latitude, longitude } points.
export function metersBetween(a, b) {
  return distance(
    point([a.longitude, a.latitude]),
    point([b.longitude, b.latitude]),
    { units: "meters" },
  );
}
