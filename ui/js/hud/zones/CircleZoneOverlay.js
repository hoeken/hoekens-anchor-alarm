// Leaflet layer for a circle watch zone. Wraps a single L.circle so the parent
// AnchorOverlay can swap between zone shapes by destroying the old overlay and
// constructing a new one. All geometry queries (contains / getBounds) are
// delegated to the shared WatchZone instance so the UI and the backend agree
// on what "inside the zone" means.

// Smallest radius we'll actually paint. L.circle with radius 0 produces
// degenerate bounds that crash fitBounds via NaN-valued projection math.
const MIN_RENDER_RADIUS_M = 20;

export class CircleZoneOverlay {
  static get type() {
    return "circle";
  }

  constructor({ map, anchorPosition, zone, onChange }) {
    this._map = map;
    this._zone = zone;
    this._anchorPosition = anchorPosition;
    this._onChange = onChange;
    this._color = "blue";

    this._layer = L.circle(anchorPosition, this._renderRadius(), {
      color: this._color,
    }).addTo(map);
  }

  _renderRadius() {
    const r = this._zone?.getCircleRadius?.();
    return r != null && r > 0 ? r : MIN_RENDER_RADIUS_M;
  }

  update({ zone, anchorPosition }) {
    if (zone)
      this._zone = zone;
    if (anchorPosition)
      this._anchorPosition = anchorPosition;
    this._layer.setLatLng(this._anchorPosition);
    this._layer.setRadius(this._renderRadius());
  }

  setColor(color) {
    if (color === this._color)
      return;
    this._color = color;
    this._layer.setStyle({ color });
  }

  getBounds() {
    return this._layer.getBounds();
  }

  // True when the vessel is inside the zone. Defers to the shared WatchZone so
  // the UI's alarm-color logic matches the backend's alarm-trigger logic.
  contains(vesselLatLng) {
    if (!vesselLatLng || !this._zone)
      return true;
    return this._zone.contains(
      { latitude: vesselLatLng.lat, longitude: vesselLatLng.lng },
      { latitude: this._anchorPosition.lat, longitude: this._anchorPosition.lng },
    );
  }

  destroy() {
    this._map.removeLayer(this._layer);
  }
}
