// Shared geographic primitives used by both the SignalK plugin (Node) and the
// browser UI bundle. Pure functions, no platform dependencies.

export const EARTH_RADIUS_METERS = 6371000;

export function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

export function rad2deg(rad) {
  return rad * (180 / Math.PI);
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
    Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

// Initial great-circle bearing from (lat1, lon1) to (lat2, lon2). Returns
// degrees in [0, 360), clockwise from true north.
export function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δλ = deg2rad(lon2 - lon1);
  const x = Math.cos(φ2) * Math.sin(Δλ);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (rad2deg(Math.atan2(x, y)) + 360) % 360;
}
