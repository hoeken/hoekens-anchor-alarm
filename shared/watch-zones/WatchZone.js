// Abstract base for anchor watch zone shapes. Subclasses implement the
// geometric primitives below; the SignalK plugin and the browser UI both
// instantiate the same subclass from a shared config blob.

export class WatchZone {
  constructor(config = {}) {
    if (new.target === WatchZone) {
      throw new Error("WatchZone is abstract — instantiate a subclass via watchZoneFromConfig().");
    }
    this._config = config;
  }

  // Stable identifier used as the discriminator in getConfig() and in the
  // factory dispatch. Subclass must override.
  getType() {
    throw new Error(`${this.constructor.name} must implement getType()`);
  }

  // Canonical JSON config including type. Round-trips through
  // watchZoneFromConfig(zone.getConfig()) to an equivalent instance.
  getConfig() {
    throw new Error(`${this.constructor.name} must implement getConfig()`);
  }

  // True when the vessel is inside the zone. Both positions use
  // { latitude, longitude } in decimal degrees. anchorPosition is provided
  // by the caller because it's stored separately on SignalK (not in the
  // zone config).
  contains(_vesselPosition, _anchorPosition) {
    throw new Error(`${this.constructor.name} must implement contains()`);
  }

  // Loose bounding box around the zone, used for map fit. Returns
  // { latMin, latMax, lonMin, lonMax }.
  getBoundingBox(_anchorPosition) {
    throw new Error(`${this.constructor.name} must implement getBoundingBox()`);
  }

  // Circle-equivalent radius in meters, or null when the shape is not a
  // simple circle. The plugin still emits navigation.anchor.maxRadius for
  // circle zones so external consumers (Freeboard, etc.) keep working.
  getCircleRadius() {
    return null;
  }
}
