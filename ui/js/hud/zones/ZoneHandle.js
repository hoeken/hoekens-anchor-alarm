// Reusable draggable dot handle for zone overlays. Pure UI: knows how to
// render a small dot at a LatLng and forward Leaflet drag events. The owning
// overlay decides what dragging means (radius, angle, etc.).

const HANDLE_ICON = L.divIcon({
  className: "zoneHandle",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export class ZoneHandle {
  constructor({ map, position, onDragStart, onDrag, onDragEnd }) {
    this._map = map;
    this._marker = L.marker(position, {
      icon: HANDLE_ICON,
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

  setStyle({ color }) {
    const el = this._marker.getElement();
    if (el)
      el.style.borderColor = color;
  }

  destroy() {
    this._map.removeLayer(this._marker);
  }
}
