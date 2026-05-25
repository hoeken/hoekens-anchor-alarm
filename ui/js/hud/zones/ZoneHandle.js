// Reusable draggable dot handle for zone overlays. Pure UI: knows how to
// render a small dot at a LatLng and forward Leaflet drag events. The owning
// overlay decides what dragging means (radius, angle, etc.).

const HANDLE_ICON = L.divIcon({
  className: "zoneHandle",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Smaller, lighter handle used for "ghost" insertion points (edge midpoints on
// the polygon overlay). Behaves identically — only the look differs.
const GHOST_HANDLE_ICON = L.divIcon({
  className: "zoneHandle zoneHandleGhost",
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export class ZoneHandle {
  constructor({ map, position, onDragStart, onDrag, onDragEnd, onClick, ghost = false }) {
    this._map = map;
    // Ghost handles are click-only: dragging them mid-edit destabilizes the
    // L.polygon Leaflet is rendering underneath. The owning overlay creates
    // a real vertex on click instead.
    const draggable = !ghost;
    this._marker = L.marker(position, {
      icon: ghost ? GHOST_HANDLE_ICON : HANDLE_ICON,
      draggable,
    }).addTo(map);

    if (draggable) {
      if (onDragStart)
        this._marker.on("dragstart", () => onDragStart());
      if (onDrag)
        this._marker.on("drag", () => onDrag(this._marker.getLatLng()));
      if (onDragEnd)
        this._marker.on("dragend", () => onDragEnd(this._marker.getLatLng()));
    }
    if (onClick)
      this._marker.on("click", () => onClick(this._marker.getLatLng()));
  }

  setPosition(latlng) {
    this._marker.setLatLng(latlng);
  }

  setStyle({ color }) {
    const el = this._marker.getElement();
    if (el)
      el.style.borderColor = color;
  }

  destroy() {
    this._map.removeLayer(this._marker);
  }
}
