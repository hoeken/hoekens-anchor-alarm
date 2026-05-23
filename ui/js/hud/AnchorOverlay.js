// AnchorOverlay owns the on-map visualization of the anchor: the radius
// circle, the bow-to-anchor line (with distance + bearing labels), and either
// the anchor marker (when dropped) or the draggable crosshair (when raised).
// The host drives it with drop/raise transitions and per-tick boat updates;
// alarm color is recomputed internally on any state or position change.

import { GeoMath } from "../GeoMath.js";
import { DisplayUnit } from "../DisplayUnit.js";

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
  constructor({ state, map, radius }) {
    this.state = state;
    this.map = map;
    this.radius = radius;
    this.dropped = false;

    this.anchorPosition = map.getCenter();
    this.boatPosition = null;
    this.heading = 0;
    this.gpsOffsets = { x: 0, y: 0 };

    this.radiusCircle = L.circle(this.anchorPosition, this.radius, {
      color: "green",
    }).addTo(map);

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

  drop(position, radius) {
    this.dropped = true;
    this.anchorPosition = position;
    this.radius = parseInt(radius, 10);
    if (!(this.radius > 0))
      this.radius = 20;

    this._removeCrosshair();
    this._removeAnchorMarker();

    this.radiusCircle.setLatLng(position);
    this.radiusCircle.setRadius(this.radius);

    this.anchorMarker = L.marker(position, { icon: ANCHOR_ICON }).addTo(
      this.map,
    );

    this._refreshLine();
    this._refreshColor();
    return this;
  }

  raise(position) {
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
      this.radiusCircle.setLatLng(this.anchorPosition);
      this._refreshLine();
      this._refreshColor();
    });

    this.radiusCircle.setLatLng(position);

    this._refreshLine();
    this._refreshColor();
    return this;
  }

  setRadius(r) {
    // Defend against 0/NaN — a zero-radius circle gives degenerate bounds
    // that crash fitBounds via NaN-valued projection math. Matches the
    // fallback drop() uses internally.
    this.radius = r > 0 ? r : 20;
    this.radiusCircle.setRadius(this.radius);
    this._refreshColor();
    return this;
  }

  setBoatPosition(coords, heading, gpsOffsets) {
    this.boatPosition = coords;
    this.heading = heading;
    this.gpsOffsets = gpsOffsets;
    this._refreshLine();
    this._refreshColor();
    return this;
  }

  getCrosshairPosition() {
    return this.crosshairMarker ? this.crosshairMarker.getLatLng() : null;
  }

  getBounds() {
    return this.radiusCircle.getBounds();
  }

  // Single entry point driven from AnchorAlarm.updateMap. Reads everything
  // from appState: dropped/raised from isAnchored(), anchor position/radius
  // from anchor.position/maxRadius, and boat geometry from
  // currentCoordinates/boatConfig. On a raised transition, the crosshair
  // starts at the previously-dropped anchor position for a smooth UX.
  update(appState) {
    this.setBoatPosition(
      appState.getPosition(),
      appState.boatConfig.heading,
      appState.boatConfig.gpsOffset,
    );

    // Sync the radius circle unconditionally — it exists in both raised and
    // dropped modes, and a stale (zero) radius gives degenerate bounds that
    // crash fitBounds via NaN-valued projection math.
    const r = appState.anchor?.maxRadius?.value;
    if (r != null)
      this.setRadius(r);

    if (appState.isAnchored()) {
      const pos = appState.getAnchorPosition();
      if (!this.dropped) {
        this.drop(pos, this.radius);
      } else {
        // Already dropped — keep position in sync with appState in case the
        // server (or another client) moved the anchor.
        this.anchorPosition = pos;
        this.radiusCircle.setLatLng(pos);
        if (this.anchorMarker)
          this.anchorMarker.setLatLng(pos);
        this._refreshLine();
      }
    } else if (this.dropped || !this.crosshairMarker) {
      // Transitioning out of dropped (carry over previous anchor position
      // for crosshair smoothness) or first-time materialization.
      this.raise(this.anchorPosition);
    }

    return this;
  }

  // For the estimate flow: place the crosshair at a guessed anchor position.
  // Safe to call before the crosshair marker exists; the next update tick
  // will materialize it at this.anchorPosition.
  setCrosshairPosition(latlng) {
    this.anchorPosition = latlng;
    this.radiusCircle.setLatLng(latlng);
    if (this.crosshairMarker)
      this.crosshairMarker.setLatLng(latlng);
    this._refreshLine();
    this._refreshColor();
    return this;
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

    let distanceLabel = `${distance}m`;
    if (this.state.anchor?.maxRadius)
      distanceLabel = DisplayUnit.formatDisplay(this.state.anchor.maxRadius, false, distance);

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
    const baseColor = this.dropped ? "green" : "blue";
    let color = baseColor;
    if (this.boatPosition) {
      const distance = GeoMath.calculateDistance(
        this.anchorPosition.lat,
        this.anchorPosition.lng,
        this.boatPosition.lat,
        this.boatPosition.lng,
      );
      if (distance > this.radius)
        color = "red";
    }
    if (color === this._cachedColor)
      return;
    this.radiusCircle.setStyle({ color });
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
