// AnchorOverlay owns the on-map visualization of the anchor: the radius
// circle, the bow-to-anchor line (with distance + bearing labels), and either
// the anchor marker (when dropped) or the draggable crosshair (when raised).
// The host drives it with drop/raise transitions and per-tick boat updates;
// alarm color is recomputed internally on any state or position change.

import { GeoMath } from "../GeoMath.js";

const ANCHOR_ICON = L.icon({
  iconUrl: "icons/anchor.png",
  iconSize: [24, 24],
  iconAnchor: [12, 4],
});

const CROSSHAIR_ICON = L.icon({
  iconUrl: "icons/crosshair.png",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export class AnchorOverlay {
  constructor({ map, radius }) {
    this.map = map;
    this.radius = radius;
    this.dropped = false;

    this.anchorPosition = map.getCenter();
    this.boatPosition = null;
    this.heading = 0;
    this.gpsOffsets = { x: 0, y: 0 };

    this.dragHandler = null;

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
  }

  drop(position, radius) {
    this.dropped = true;
    this.anchorPosition = position;
    this.radius = parseInt(radius, 10);
    if (!(this.radius > 0)) this.radius = 20;

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
      if (this.dragHandler) this.dragHandler(this.anchorPosition);
    });

    this.radiusCircle.setLatLng(position);

    this._refreshLine();
    this._refreshColor();
    return this;
  }

  setRadius(r) {
    this.radius = r;
    this.radiusCircle.setRadius(r);
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

  onCrosshairDrag(cb) {
    this.dragHandler = cb;
    return this;
  }

  getCrosshairPosition() {
    return this.crosshairMarker ? this.crosshairMarker.getLatLng() : null;
  }

  getBounds() {
    return this.radiusCircle.getBounds();
  }

  update(state) {
    this.setBoatPosition(
      state.getPosition(),
      state.boatConfig.heading,
      state.boatConfig.gpsOffset,
    );
  }

  _refreshLine() {
    if (!this.boatPosition) return;

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

    this.anchorLine.setText("");
    this.anchorLine.setText(`${distance}m`, {
      orientation: flip ? "flip" : 0,
      offset: 12,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });

    const bearing = Math.round(
      GeoMath.calculateBearing(
        bow.lat,
        bow.lng,
        this.anchorPosition.lat,
        this.anchorPosition.lng,
      ),
    );

    this.anchorLineAngle.setText("");
    this.anchorLineAngle.setText(`${bearing}°`, {
      orientation: flip ? "flip" : 0,
      offset: -3,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });
  }

  _refreshColor() {
    const baseColor = this.dropped ? "green" : "blue";
    if (!this.boatPosition) {
      this.radiusCircle.setStyle({ color: baseColor });
      return;
    }
    const distance = GeoMath.calculateDistance(
      this.anchorPosition.lat,
      this.anchorPosition.lng,
      this.boatPosition.lat,
      this.boatPosition.lng,
    );
    this.radiusCircle.setStyle({
      color: distance > this.radius ? "red" : baseColor,
    });
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
