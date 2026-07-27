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

// Drag-disabled presentation (see setDraggable): a small solid dot that still
// marks its spot but doesn't look or act like a control.
const SOLID_HANDLE_ICON = L.divIcon({
  className: "zoneHandleSolid anchor-overlay-part",
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export class ZoneHandle {
  constructor({ map, position, onDragStart, onDrag, onDragEnd, ghost = false }) {
    this._map = map;
    this._visible = true;
    this._draggable = true;
    this._color = null;
    this._icon = ghost ? GHOST_HANDLE_ICON : HANDLE_ICON;
    this._marker = L.marker(position, {
      icon: this._icon,
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
    if (visible) {
      this._marker.addTo(this._map);
      // Re-adding rebuilt the icon element and the drag handler (which
      // Leaflet re-enables from the construction-time draggable option) —
      // reapply the drag state and the inline color.
      this._applyDraggable();
      this._applyColor();
    } else {
      this._map.removeLayer(this._marker);
    }
  }

  // Toggle between the two presentations: the draggable ring (default) and a
  // small solid zone-colored dot for viewers who can't edit. The anchor
  // position handle doubles as the anchor marker, so unlike the zone handles
  // it can't be hidden from anonymous users — it just must not look, or act,
  // draggable.
  setDraggable(draggable) {
    if (draggable === this._draggable)
      return;
    this._draggable = draggable;
    this._applyDraggable();
    // setIcon reset the element's className — repaint the inline color onto
    // the property the new look uses (border ring vs solid fill).
    this._applyColor();
  }

  _applyDraggable() {
    // Order matters: setIcon rebuilds the drag handler carrying over its
    // enabled state, so disable before it and enable after. While the marker
    // is off the map it has no drag handler at all (Leaflet deletes it on
    // remove) — setVisible(true) re-runs this to enforce the state on the
    // rebuilt handler.
    if (!this._draggable)
      this._marker.dragging?.disable();
    this._marker.setIcon(this._draggable ? this._icon : SOLID_HANDLE_ICON);
    if (this._draggable)
      this._marker.dragging?.enable();
  }

  setStyle({ color }) {
    this._color = color;
    this._applyColor();
  }

  _applyColor() {
    const el = this._marker.getElement();
    if (!el || !this._color)
      return;
    if (this._draggable) {
      el.style.borderColor = this._color;
      el.style.backgroundColor = "";
    } else {
      el.style.backgroundColor = this._color;
      el.style.borderColor = "";
    }
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
