// Leaflet layer for a circle watch zone. Wraps a single L.circle so the parent
// AnchorOverlay can swap between zone shapes by destroying the old overlay and
// constructing a new one. All geometry queries (contains / getBounds) are
// delegated to the shared WatchZone instance so the UI and the backend agree
// on what "inside the zone" means.

import { destination, distance, point } from "@turf/turf";
import { CircleZone } from "../../../../shared/watch-zones/CircleZone.js";
import { ZoneHandle } from "./ZoneHandle.js";

// Smallest radius we'll actually paint. L.circle with radius 0 produces
// degenerate bounds that crash fitBounds via NaN-valued projection math.
const MIN_RENDER_RADIUS_M = 20;

// Bearing (degrees, compass) at which the radius drag handle rests at idle.
// Due east lands on the right side of north-up maps.
const HANDLE_BEARING_DEG = 90;

export class CircleZoneOverlay {
  static get type() {
    return "circle";
  }

  constructor({ map, anchorPosition, zone, onChange, onInput }) {
    this._map = map;
    this._zone = zone;
    this._anchorPosition = anchorPosition;
    this._onChange = onChange;
    this._onInput = onInput;
    this._color = "blue";
    this._dragging = false;

    this._layer = L.circle(anchorPosition, this._renderRadius(), {
      color: this._color,
    }).addTo(map);

    this._handle = new ZoneHandle({
      map,
      position: this._restPosition(),
      onDragStart: () => { this._dragging = true; },
      onDrag: (latlng) => this._handleDrag(latlng),
      onDragEnd: (latlng) => this._handleDragEnd(latlng),
    });
  }

  _renderRadius() {
    const r = this._zone?.getCircleRadius?.();
    return r != null && r > 0 ? r : MIN_RENDER_RADIUS_M;
  }

  // Where the handle sits when not being dragged: on the east perimeter at the
  // current radius.
  _restPosition() {
    const p = destination(
      point([this._anchorPosition.lng, this._anchorPosition.lat]),
      this._renderRadius(),
      HANDLE_BEARING_DEG,
      { units: "meters" },
    );
    const [lon, lat] = p.geometry.coordinates;
    return L.latLng(lat, lon);
  }

  _radiusFrom(latlng) {
    return Math.max(
      MIN_RENDER_RADIUS_M,
      Math.round(
        distance(
          point([this._anchorPosition.lng, this._anchorPosition.lat]),
          point([latlng.lng, latlng.lat]),
          { units: "meters" },
        ),
      ),
    );
  }

  // Live preview during drag. The handle visibly follows the cursor (Leaflet's
  // Draggable owns its position) — we only resize the circle to match the
  // cursor-to-anchor distance and call onInput so the backend suppression
  // window stays fresh.
  _handleDrag(latlng) {
    const radius = this._radiusFrom(latlng);
    if (radius === this._zone?.getCircleRadius?.())
      return;
    this._zone = new CircleZone({ radius });
    this._layer.setRadius(radius);
    if (this._onInput)
      this._onInput({ type: "circle", radius });
  }

  // Commit on release. Snap the handle back to its rest position (east
  // perimeter at the committed radius) and post to the backend via onChange.
  _handleDragEnd(latlng) {
    const radius = this._radiusFrom(latlng);
    this._zone = new CircleZone({ radius });
    this._layer.setRadius(radius);
    this._dragging = false;
    this._handle.setPosition(this._restPosition());
    if (this._onChange)
      this._onChange({ type: "circle", radius });
  }

  update({ zone, anchorPosition }) {
    if (zone)
      this._zone = zone;
    if (anchorPosition)
      this._anchorPosition = anchorPosition;
    this._layer.setLatLng(this._anchorPosition);
    this._layer.setRadius(this._renderRadius());
    // Don't yank the handle out from under the user's finger while they're
    // dragging it — the onEdit → updateMap cascade re-enters here on every
    // tick. _handleDragEnd resnaps the handle on release.
    if (!this._dragging)
      this._handle.setPosition(this._restPosition());
  }

  setColor(color) {
    if (color === this._color)
      return;
    this._color = color;
    this._layer.setStyle({ color });
    this._handle.setStyle({ color });
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
    this._handle.destroy();
    this._map.removeLayer(this._layer);
  }
}
