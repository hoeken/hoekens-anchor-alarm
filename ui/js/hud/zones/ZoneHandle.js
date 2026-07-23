// Reusable draggable dot handle for zone overlays. Pure UI: knows how to
// render a small dot at a LatLng and forward Leaflet drag events. The owning
// overlay decides what dragging means (radius, angle, etc.).

// anchor-overlay-part opts every handle into AnchorOverlay's zoomed-too-small
// hiding (see hide-anchor-overlay in style.css) — the rule also swallows
// pointer events, so a hidden handle can't be dragged.
const HANDLE_ICON = L.divIcon({
  className: "zoneHandle anchor-overlay-part",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Smaller, lighter handle used for "ghost" insertion points (edge midpoints on
// the polygon overlay). Behaves identically — only the look differs.
const GHOST_HANDLE_ICON = L.divIcon({
  className: "zoneHandle zoneHandleGhost anchor-overlay-part",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export class ZoneHandle {
  constructor({ map, position, onDragStart, onDrag, onDragEnd, ghost = false }) {
    this._map = map;
    this._visible = true;
    this._marker = L.marker(position, {
      icon: ghost ? GHOST_HANDLE_ICON : HANDLE_ICON,
      draggable: true,
    }).addTo(map);

    if (onDragStart)
      this._marker.on("dragstart", () => onDragStart());
    if (onDrag)
      this._marker.on("drag", () => onDrag(this._marker.getLatLng()));
    if (onDragEnd)
      this._marker.on("dragend", () => onDragEnd(this._marker.getLatLng()));
  }

  setPosition(latlng) {
    this._marker.setLatLng(latlng);
  }

  // Add/remove the marker from the map so anonymous (not-logged-in) users see
  // the zone shape but get no draggable controls. Removing the layer also kills
  // its drag interaction, not just its visibility.
  setVisible(visible) {
    if (visible === this._visible)
      return;
    this._visible = visible;
    if (visible)
      this._marker.addTo(this._map);
    else
      this._map.removeLayer(this._marker);
  }

  setStyle({ color }) {
    const el = this._marker.getElement();
    if (el)
      el.style.borderColor = color;
  }

  setMergeArmed(armed) {
    const el = this._marker.getElement();
    if (el)
      el.classList.toggle("zoneHandleMergeArmed", armed);
  }

  destroy() {
    this._map.removeLayer(this._marker);
  }
}
