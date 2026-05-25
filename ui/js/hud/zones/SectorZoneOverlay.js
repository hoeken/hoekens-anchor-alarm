// Leaflet layer for a sector watch zone. The sector is drawn as an L.polygon
// (anchor apex + sampled arc) with three ZoneHandles: one on the bisector that
// drives radius, and one each on the startAngle / endAngle rays that drive
// those bearings. Live preview + commit follows the same onInput/onChange
// pattern as CircleZoneOverlay so AnchorController.previewZone/setZone keep
// working without per-shape branching.

import { GeoMath } from "../../GeoMath.js";
import { SectorZone } from "../../../../shared/watch-zones/SectorZone.js";
import { ZoneHandle } from "./ZoneHandle.js";

const MIN_RENDER_RADIUS_M = 20;
const MIN_ARC_DEGREES = 10;
const MAX_ARC_DEGREES = 350;
// Vertices sampled along the arc. 64 is smooth enough at fitBounds scale
// without making the polygon a perf hot spot during drag.
const ARC_SAMPLE_COUNT = 64;

export class SectorZoneOverlay {
  static get type() {
    return "sector";
  }

  constructor({ map, anchorPosition, zone, onChange, onInput }) {
    this._map = map;
    this._zone = zone;
    this._anchorPosition = anchorPosition;
    this._onChange = onChange;
    this._onInput = onInput;
    this._color = "blue";
    this._draggingHandle = null;

    this._layer = L.polygon(this._polygonPoints(), {
      color: this._color,
    }).addTo(map);

    const positions = this._handlePositions();
    this._radiusHandle = new ZoneHandle({
      map,
      position: positions.radius,
      onDragStart: () => { this._draggingHandle = "radius"; },
      onDrag: (latlng) => this._handleRadiusDrag(latlng),
      onDragEnd: (latlng) => this._handleRadiusDragEnd(latlng),
    });
    this._startHandle = new ZoneHandle({
      map,
      position: positions.start,
      onDragStart: () => { this._draggingHandle = "start"; },
      onDrag: (latlng) => this._handleAngleDrag("start", latlng),
      onDragEnd: (latlng) => this._handleAngleDragEnd("start", latlng),
    });
    this._endHandle = new ZoneHandle({
      map,
      position: positions.end,
      onDragStart: () => { this._draggingHandle = "end"; },
      onDrag: (latlng) => this._handleAngleDrag("end", latlng),
      onDragEnd: (latlng) => this._handleAngleDragEnd("end", latlng),
    });
  }

  _renderRadius() {
    return Math.max(MIN_RENDER_RADIUS_M, this._zone?.radius ?? MIN_RENDER_RADIUS_M);
  }

  _arcWidth() {
    return (this._zone.endAngle - this._zone.startAngle + 360) % 360;
  }

  _bisectorBearing() {
    return (this._zone.startAngle + this._arcWidth() / 2) % 360;
  }

  _pointAtBearing(bearingDeg, radius) {
    const p = GeoMath.calculateDestinationPoint(
      this._anchorPosition.lat,
      this._anchorPosition.lng,
      bearingDeg,
      radius,
    );
    return L.latLng(p.latitude, p.longitude);
  }

  _polygonPoints() {
    const r = this._renderRadius();
    const start = this._zone.startAngle;
    const width = this._arcWidth();
    const step = width / ARC_SAMPLE_COUNT;
    const points = [L.latLng(this._anchorPosition.lat, this._anchorPosition.lng)];
    for (let i = 0; i <= ARC_SAMPLE_COUNT; i++) {
      const θ = (start + step * i) % 360;
      points.push(this._pointAtBearing(θ, r));
    }
    return points;
  }

  _handlePositions() {
    const r = this._renderRadius();
    return {
      radius: this._pointAtBearing(this._bisectorBearing(), r),
      start: this._pointAtBearing(this._zone.startAngle, r),
      end: this._pointAtBearing(this._zone.endAngle, r),
    };
  }

  _radiusFrom(latlng) {
    return Math.max(
      MIN_RENDER_RADIUS_M,
      Math.round(
        GeoMath.calculateDistance(
          this._anchorPosition.lat,
          this._anchorPosition.lng,
          latlng.lat,
          latlng.lng,
        ),
      ),
    );
  }

  _bearingFrom(latlng) {
    return GeoMath.calculateBearing(
      this._anchorPosition.lat,
      this._anchorPosition.lng,
      latlng.lat,
      latlng.lng,
    );
  }

  // Preserve all fields not being changed; SectorZone backfills defaults for
  // any missing ones which would silently clobber the user's other settings.
  _setZone(next) {
    this._zone = new SectorZone({
      radius: next.radius ?? this._zone.radius,
      startAngle: next.startAngle ?? this._zone.startAngle,
      endAngle: next.endAngle ?? this._zone.endAngle,
    });
    this._layer.setLatLngs(this._polygonPoints());
    this._repositionHandles();
  }

  _repositionHandles() {
    const positions = this._handlePositions();
    if (this._draggingHandle !== "radius")
      this._radiusHandle.setPosition(positions.radius);
    if (this._draggingHandle !== "start")
      this._startHandle.setPosition(positions.start);
    if (this._draggingHandle !== "end")
      this._endHandle.setPosition(positions.end);
  }

  _emitInput() {
    if (this._onInput)
      this._onInput(this._zone.getConfig());
  }

  _emitChange() {
    if (this._onChange)
      this._onChange(this._zone.getConfig());
  }

  _handleRadiusDrag(latlng) {
    const radius = this._radiusFrom(latlng);
    if (radius === this._zone.radius)
      return;
    this._setZone({ radius });
    this._emitInput();
  }

  _handleRadiusDragEnd(latlng) {
    const radius = this._radiusFrom(latlng);
    this._setZone({ radius });
    this._draggingHandle = null;
    this._repositionHandles();
    this._emitChange();
  }

  // Clamp a proposed new start/end angle so the arc width stays in
  // [MIN_ARC_DEGREES, MAX_ARC_DEGREES]. The opposite endpoint is fixed —
  // moving past it would flip the sector inside out.
  _clampAngle(which, proposed) {
    if (which === "start") {
      const arcWidth = (this._zone.endAngle - proposed + 360) % 360;
      if (arcWidth < MIN_ARC_DEGREES)
        return (this._zone.endAngle - MIN_ARC_DEGREES + 360) % 360;
      if (arcWidth > MAX_ARC_DEGREES)
        return (this._zone.endAngle - MAX_ARC_DEGREES + 360) % 360;
      return proposed;
    }
    const arcWidth = (proposed - this._zone.startAngle + 360) % 360;
    if (arcWidth < MIN_ARC_DEGREES)
      return (this._zone.startAngle + MIN_ARC_DEGREES) % 360;
    if (arcWidth > MAX_ARC_DEGREES)
      return (this._zone.startAngle + MAX_ARC_DEGREES) % 360;
    return proposed;
  }

  _handleAngleDrag(which, latlng) {
    const angle = this._clampAngle(which, this._bearingFrom(latlng));
    const field = which === "start" ? "startAngle" : "endAngle";
    if (angle === this._zone[field])
      return;
    this._setZone({ [field]: angle });
    this._emitInput();
  }

  _handleAngleDragEnd(which, latlng) {
    const angle = this._clampAngle(which, this._bearingFrom(latlng));
    const field = which === "start" ? "startAngle" : "endAngle";
    this._setZone({ [field]: angle });
    this._draggingHandle = null;
    this._repositionHandles();
    this._emitChange();
  }

  update({ zone, anchorPosition }) {
    if (zone)
      this._zone = zone;
    if (anchorPosition)
      this._anchorPosition = anchorPosition;
    this._layer.setLatLngs(this._polygonPoints());
    // Don't yank the handle out from under the user's finger while they're
    // dragging it. _repositionHandles already gates per-handle via
    // _draggingHandle so the other two still follow the geometry.
    this._repositionHandles();
  }

  setColor(color) {
    if (color === this._color)
      return;
    this._color = color;
    this._layer.setStyle({ color });
    this._radiusHandle.setStyle({ color });
    this._startHandle.setStyle({ color });
    this._endHandle.setStyle({ color });
  }

  getBounds() {
    return this._layer.getBounds();
  }

  contains(vesselLatLng) {
    if (!vesselLatLng || !this._zone)
      return true;
    return this._zone.contains(
      { latitude: vesselLatLng.lat, longitude: vesselLatLng.lng },
      { latitude: this._anchorPosition.lat, longitude: this._anchorPosition.lng },
    );
  }

  destroy() {
    this._radiusHandle.destroy();
    this._startHandle.destroy();
    this._endHandle.destroy();
    this._map.removeLayer(this._layer);
  }
}
