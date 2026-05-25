// AnchorOverlay owns the on-map visualization of the anchor: the anchor
// marker (when dropped) or the draggable crosshair (when raised), the
// bow-to-anchor line (with distance + bearing labels), and a per-shape
// watch-zone overlay. The host drives it with drop/raise transitions and
// per-tick boat updates; alarm color is recomputed internally on any state
// or position change. The zone layer is delegated to a zone-specific class
// in ./zones/ — to add a new shape, register it there.

import { GeoMath } from "../GeoMath.js";
import { DisplayUnit } from "../DisplayUnit.js";
import { createZoneOverlay } from "./zones/index.js";

// DivIcon (not L.icon) so we can rotate the inner <img> via CSS transform
// without clobbering the translate3d that Leaflet sets on the marker element.
const ANCHOR_ICON = L.divIcon({
  className: "",
  html: '<img src="icons/anchor.png" width="24" height="24" style="transform-origin: 12px 4px;" />',
  iconSize: [24, 24],
  iconAnchor: [12, 4],
});

const CROSSHAIR_ICON = L.icon({
  iconUrl: "icons/crosshair.png",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export class AnchorOverlay {
  constructor({ state, map }) {
    this.state = state;
    this.map = map;
    this.dropped = false;

    this.anchorPosition = map.getCenter();
    this.boatPosition = null;
    this.heading = 0;
    this.gpsOffsets = { x: 0, y: 0 };

    this.zoneOverlay = null;
    this._zoneType = null;
    this._zone = null;

    // Two overlapping polylines because leaflet.textpath only supports one
    // label per polyline; one carries the distance label, the other
    // (invisible) carries the bearing label.
    this.anchorLine = L.polyline([this.anchorPosition, this.anchorPosition], {
      color: "grey",
      weight: 2,
    }).addTo(map);

    this.anchorLineAngle = L.polyline(
      [this.anchorPosition, this.anchorPosition],
      {
        color: "grey",
        weight: 0,
      },
    ).addTo(map);

    this.anchorMarker = null;
    this.crosshairMarker = null;

    this._cachedDistanceLabel = null;
    this._cachedBearingLabel = null;
    this._cachedFlip = null;
    this._cachedColor = null;
  }

  getCrosshairPosition() {
    return this.crosshairMarker ? this.crosshairMarker.getLatLng() : null;
  }

  getBounds() {
    return this.zoneOverlay
      ? this.zoneOverlay.getBounds()
      : L.latLngBounds(this.anchorPosition, this.anchorPosition);
  }

  // Single entry point driven from AnchorAlarm.updateMap. Reads everything
  // from appState: dropped/raised from isAnchored(), anchor position from
  // anchor.position, zone shape from anchor.watchZone (via getWatchZone),
  // and boat geometry from currentCoordinates/boatConfig. On a raised
  // transition, the crosshair starts at the previously-dropped anchor
  // position for a smooth UX.
  update(appState) {
    this._setBoatPosition(
      appState.getPosition(),
      appState.boatConfig.heading,
      appState.boatConfig.gpsOffset,
    );

    // Resolve the current zone shape, swapping the underlying overlay when
    // the type changes. Always set so the layer exists even before a drop.
    this._zone = appState.getWatchZone();
    this._ensureZoneOverlay();

    if (appState.isAnchored()) {
      const pos = appState.getAnchorPosition();
      if (!this.dropped) {
        this._drop(pos);
      } else {
        // Already dropped — keep position in sync with appState in case the
        // server (or another client) moved the anchor.
        this.anchorPosition = pos;
        this.zoneOverlay.update({ zone: this._zone, anchorPosition: pos });
        if (this.anchorMarker)
          this.anchorMarker.setLatLng(pos);
        this._refreshLine();
      }
    } else if (this.dropped || !this.crosshairMarker) {
      // Transitioning out of dropped (carry over previous anchor position
      // for crosshair smoothness) or first-time materialization.
      this._raise(this.anchorPosition);
    } else {
      // Still raised — zone shape or radius may have changed via the toolbar.
      this.zoneOverlay.update({ zone: this._zone, anchorPosition: this.anchorPosition });
    }

    this._refreshColor();
    return this;
  }

  // For the estimate flow: place the crosshair at a guessed anchor position.
  // Safe to call before the crosshair marker exists; the next update tick
  // will materialize it at this.anchorPosition.
  setCrosshairPosition(latlng) {
    this.anchorPosition = latlng;
    if (this.zoneOverlay)
      this.zoneOverlay.update({ anchorPosition: latlng });
    if (this.crosshairMarker)
      this.crosshairMarker.setLatLng(latlng);
    this._refreshLine();
    this._refreshColor();
    return this;
  }

  // === Internal ====================================================================

  _ensureZoneOverlay() {
    if (!this._zone)
      return;
    const newType = this._zone.getType();
    if (this.zoneOverlay && this._zoneType === newType) {
      this.zoneOverlay.update({ zone: this._zone, anchorPosition: this.anchorPosition });
      return;
    }
    if (this.zoneOverlay)
      this.zoneOverlay.destroy();
    this.zoneOverlay = createZoneOverlay(this._zone, {
      map: this.map,
      anchorPosition: this.anchorPosition,
    });
    this._zoneType = newType;
    this._cachedColor = null; // force a recolor on next refresh
  }

  _drop(position) {
    this.dropped = true;
    this.anchorPosition = position;

    this._removeCrosshair();
    this._removeAnchorMarker();

    if (this.zoneOverlay)
      this.zoneOverlay.update({ zone: this._zone, anchorPosition: position });

    this.anchorMarker = L.marker(position, { icon: ANCHOR_ICON }).addTo(
      this.map,
    );

    this._refreshLine();
  }

  _raise(position) {
    this.dropped = false;
    this.anchorPosition = position;

    this._removeAnchorMarker();
    this._removeCrosshair();

    this.crosshairMarker = L.marker(position, {
      icon: CROSSHAIR_ICON,
      draggable: true,
    }).addTo(this.map);

    this.crosshairMarker.on("drag", () => {
      this.anchorPosition = this.crosshairMarker.getLatLng();
      if (this.zoneOverlay)
        this.zoneOverlay.update({ anchorPosition: this.anchorPosition });
      this._refreshLine();
      this._refreshColor();
    });

    if (this.zoneOverlay)
      this.zoneOverlay.update({ zone: this._zone, anchorPosition: position });

    this._refreshLine();
  }

  _setBoatPosition(coords, heading, gpsOffsets) {
    this.boatPosition = coords;
    this.heading = heading;
    this.gpsOffsets = gpsOffsets;
    this._refreshLine();
  }

  _refreshLine() {
    if (!this.boatPosition)
      return;

    const bow = GeoMath.calculateBowCoordinates(
      this.boatPosition,
      this.heading,
      this.gpsOffsets.x,
      this.gpsOffsets.y,
    );

    this.anchorLine.setLatLngs([bow, this.anchorPosition]);
    this.anchorLineAngle.setLatLngs([bow, this.anchorPosition]);

    // textpath label flipping: if the anchor is west of the bow, the label
    // reads upside-down without this flip. (Degenerate when bow and anchor
    // sit on the same meridian.)
    const flip = bow.lng > this.anchorPosition.lng;

    let distance = GeoMath.calculateDistance(
      bow.lat,
      bow.lng,
      this.anchorPosition.lat,
      this.anchorPosition.lng,
    );
    distance = Math.round(distance * 10) / 10;
    let distanceLabel = DisplayUnit.formatValue(distance, "depth");

    const bearing = Math.round(
      GeoMath.calculateBearing(
        bow.lat,
        bow.lng,
        this.anchorPosition.lat,
        this.anchorPosition.lng,
      ),
    );
    const bearingLabel = `${bearing}°`;

    // Rotate so the anchor's ring (top of icon, at iconAnchor [12,4]) faces
    // back toward the bow; the flukes trail away from the rode.
    this._updateAnchorRotation(bearing + 180);

    // Skip textpath rebuilds when the rendered label hasn't changed. Leaflet
    // re-runs _textRedraw on every _updatePath, so the labels still follow
    // the moving line without an explicit setText here.
    if (
      distanceLabel === this._cachedDistanceLabel &&
      bearingLabel === this._cachedBearingLabel &&
      flip === this._cachedFlip
    )
      return;

    this.anchorLine.setText("");
    this.anchorLine.setText(distanceLabel, {
      orientation: flip ? "flip" : 0,
      offset: 12,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });

    this.anchorLineAngle.setText("");
    this.anchorLineAngle.setText(bearingLabel, {
      orientation: flip ? "flip" : 0,
      offset: -3,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });

    this._cachedDistanceLabel = distanceLabel;
    this._cachedBearingLabel = bearingLabel;
    this._cachedFlip = flip;
  }

  _refreshColor() {
    if (!this.zoneOverlay)
      return;
    const baseColor = this.dropped ? "green" : "blue";
    let color = baseColor;
    if (this.boatPosition && !this.zoneOverlay.contains(this.boatPosition))
      color = "red";
    if (color === this._cachedColor)
      return;
    this.zoneOverlay.setColor(color);
    this._cachedColor = color;
  }

  _updateAnchorRotation(deg) {
    if (!this.anchorMarker)
      return;
    const el = this.anchorMarker.getElement();
    const img = el && el.querySelector("img");
    if (img)
      img.style.transform = `rotate(${deg}deg)`;
  }

  _removeAnchorMarker() {
    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }
  }

  _removeCrosshair() {
    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = null;
    }
  }
}
