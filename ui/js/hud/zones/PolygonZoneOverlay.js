// Leaflet layer for a polygon watch zone. Vertices are stored anchor-relative
// as {bearing, distance}; the overlay renders them to lat/lng for L.polygon
// and back when the user drags a vertex. Self-intersection is prevented by a
// binary-search clamp along the drag vector (the vertex sticks at the
// furthest position that still leaves the polygon simple).

import {
  bearing as turfBearing,
  bearingToAzimuth,
  destination,
  distance,
  point,
} from "@turf/turf";
import {
  PolygonZone,
  MAX_VERTICES,
  MIN_VERTICES,
  verticesAreSimple,
  projectVertex,
} from "../../../../shared/watch-zones/PolygonZone.js";
import { ZoneHandle } from "./ZoneHandle.js";

const CLAMP_BISECTIONS = 8;
// Pixel radius around an adjacent vertex within which a drag arms the
// merge-to-delete gesture. Sized for fingertip targeting on touch.
const MERGE_PX = 20;

function midpoint(a, b) {
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
}

// Inverse of projectVertex: turn a flat (x, y) in meters back to
// {bearing, distance}. Used to convert lerped projected points back to the
// storage form.
function unproject(x, y) {
  const distance = Math.sqrt(x * x + y * y);
  const bearing = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  return { bearing, distance };
}

export class PolygonZoneOverlay {
  static get type() {
    return "polygon";
  }

  // Default to a regular 8-gon at the supplied radius. PolygonZoneControls
  // owns the editable side count + radius; this is just the initial shape on
  // first switch into polygon mode.
  static defaultConfig({ radius }) {
    return {
      type: "polygon",
      vertices: regularPolygonVertices(8, radius),
    };
  }

  constructor({ map, anchorPosition, zone, onChange, onInput }) {
    this._map = map;
    this._zone = zone;
    this._anchorPosition = anchorPosition;
    this._onChange = onChange;
    this._onInput = onInput;
    this._color = "blue";
    // Index of the vertex currently being dragged (real or promoted ghost),
    // or null when idle. Used to skip repositioning the active handle so
    // Leaflet's drag doesn't get yanked.
    this._draggingIndex = null;
    // Snapshot of the committed vertices at the start of the current drag.
    // The clamp walks back along the drag toward this state.
    this._dragOriginVertices = null;
    // ZoneHandle currently being dragged (real or ghost). Tracked separately
    // from _draggingIndex because a promoted ghost still lives in
    // _ghostHandles until drag end rebuilds the handle set.
    this._draggingHandle = null;
    // Adjacent vertex index the dragged vertex would merge into on release,
    // or null when not armed. Set by _updateMergeArmed during drag.
    this._mergeTargetIndex = null;

    this._layer = L.polygon(this._renderLatLngs(), {
      color: this._color,
    }).addTo(map);

    this._vertexHandles = [];
    this._ghostHandles = [];
    this._buildHandles();
  }

  // === Geometry helpers ============================================================

  _vertexLatLng(v) {
    const p = destination(
      point([this._anchorPosition.lng, this._anchorPosition.lat]),
      v.distance,
      v.bearing,
      { units: "meters" },
    );
    const [lon, lat] = p.geometry.coordinates;
    return L.latLng(lat, lon);
  }

  _renderLatLngs() {
    return this._zone.vertices.map((v) => this._vertexLatLng(v));
  }

  _vertexFromLatLng(latlng) {
    const anchorPt = point([this._anchorPosition.lng, this._anchorPosition.lat]);
    const target = point([latlng.lng, latlng.lat]);
    return {
      bearing: bearingToAzimuth(turfBearing(anchorPt, target)),
      distance: Math.max(1, distance(anchorPt, target, { units: "meters" })),
    };
  }

  // Midpoint of the edge between vertex i and vertex (i+1) % n, expressed
  // as a {bearing, distance} pair. Used as the rest position for the ghost
  // insertion handle on that edge.
  _edgeMidpointVertex(i) {
    const n = this._zone.vertices.length;
    const a = projectVertex(this._zone.vertices[i]);
    const b = projectVertex(this._zone.vertices[(i + 1) % n]);
    const m = midpoint(a, b);
    return unproject(m.x, m.y);
  }

  // === Handle lifecycle ============================================================

  _buildHandles() {
    this._destroyHandles();
    const n = this._zone.vertices.length;
    for (let i = 0; i < n; i++) {
      const handle = new ZoneHandle({
        map: this._map,
        position: this._vertexLatLng(this._zone.vertices[i]),
        onDragStart: () => this._onVertexDragStart(i),
        onDrag: (latlng) => this._onVertexDrag(i, latlng),
        onDragEnd: (latlng) => this._onVertexDragEnd(i, latlng),
      });
      handle.setStyle({ color: this._color });
      this._vertexHandles.push(handle);
    }
    // Hide ghosts once we'd violate the max vertex cap by inserting one more.
    if (n < MAX_VERTICES) {
      for (let i = 0; i < n; i++) {
        const ghost = new ZoneHandle({
          map: this._map,
          position: this._vertexLatLng(this._edgeMidpointVertex(i)),
          ghost: true,
          onDragStart: () => this._onGhostDragStart(i),
          onDrag: (latlng) => this._onVertexDrag(this._draggingIndex, latlng),
          onDragEnd: (latlng) => this._onVertexDragEnd(this._draggingIndex, latlng),
        });
        ghost.setStyle({ color: this._color });
        this._ghostHandles.push(ghost);
      }
    }
  }

  _destroyHandles() {
    for (const h of this._vertexHandles)
      h.destroy();
    for (const h of this._ghostHandles)
      h.destroy();
    this._vertexHandles = [];
    this._ghostHandles = [];
  }

  // Safe to call mid-drag: each loop is gated on the handle array length
  // matching the current vertex count. During a ghost-promoted drag those
  // counts are off-by-one, so we skip until drag end rebuilds the set.
  _repositionIdleHandles() {
    const n = this._zone.vertices.length;
    if (this._vertexHandles.length === n) {
      for (let i = 0; i < n; i++) {
        if (i === this._draggingIndex)
          continue;
        this._vertexHandles[i].setPosition(this._vertexLatLng(this._zone.vertices[i]));
      }
    }
    if (this._ghostHandles.length === n) {
      for (let i = 0; i < n; i++) {
        this._ghostHandles[i].setPosition(this._vertexLatLng(this._edgeMidpointVertex(i)));
      }
    }
  }

  // === Vertex drag =================================================================

  _onVertexDragStart(i) {
    this._draggingIndex = i;
    this._dragOriginVertices = this._zone.vertices.map((v) => ({ ...v }));
    this._draggingHandle = this._vertexHandles[i];
  }

  // Returns the adjacent vertex index within MERGE_PX of `latlng`, or null.
  // Only adjacent vertices are considered — the self-intersection clamp
  // already prevents the dragged vertex from reaching anywhere else. Bails
  // when removing a vertex would drop us below the minimum.
  _findMergeTarget(i, latlng) {
    const n = this._zone.vertices.length;
    if (n <= MIN_VERTICES)
      return null;
    const draggedPt = this._map.latLngToContainerPoint(latlng);
    let bestIdx = null;
    let bestDist = Infinity;
    for (const delta of [-1, 1]) {
      const j = (i + delta + n) % n;
      const neighborPt = this._map.latLngToContainerPoint(
        this._vertexLatLng(this._zone.vertices[j]),
      );
      const dx = draggedPt.x - neighborPt.x;
      const dy = draggedPt.y - neighborPt.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < MERGE_PX && d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    return bestIdx;
  }

  _updateMergeArmed(i, latlng) {
    const target = this._findMergeTarget(i, latlng);
    const wasArmed = this._mergeTargetIndex !== null;
    const armed = target !== null;
    if (armed !== wasArmed)
      this._draggingHandle?.setMergeArmed(armed);
    this._mergeTargetIndex = target;
  }

  // Clamp proposed via binary search in projected (x, y) space, walking from
  // the proposed point back toward the drag-origin position until kinks()
  // reports a simple polygon. Returns the best valid vertex found, or the
  // origin position when even the origin is invalid (should not happen).
  _clampProposed(i, proposed) {
    const origin = this._dragOriginVertices[i];
    const candidate = this._withVertex(i, proposed);
    if (verticesAreSimple(candidate))
      return proposed;
    const op = projectVertex(origin);
    const pp = projectVertex(proposed);
    let lo = 0;
    let hi = 1;
    let bestValid = origin;
    for (let step = 0; step < CLAMP_BISECTIONS; step++) {
      const mid = (lo + hi) / 2;
      const x = op[0] + (pp[0] - op[0]) * mid;
      const y = op[1] + (pp[1] - op[1]) * mid;
      const trial = unproject(x, y);
      if (verticesAreSimple(this._withVertex(i, trial))) {
        bestValid = trial;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return bestValid;
  }

  _withVertex(i, vertex) {
    const next = this._zone.vertices.map((v) => ({ ...v }));
    next[i] = vertex;
    return next;
  }

  _commitVertices(vertices, emit) {
    this._zone = new PolygonZone({ vertices });
    this._layer.setLatLngs(this._renderLatLngs());
    if (emit === "input" && this._onInput)
      this._onInput(this._zone.getConfig());
    if (emit === "change" && this._onChange)
      this._onChange(this._zone.getConfig());
  }

  _onVertexDrag(i, latlng) {
    if (i == null || !this._dragOriginVertices)
      return;
    const proposed = this._vertexFromLatLng(latlng);
    const clamped = this._clampProposed(i, proposed);
    const next = this._withVertex(i, clamped);
    this._commitVertices(next, "input");
    this._repositionIdleHandles();
    this._updateMergeArmed(i, latlng);
  }

  _onVertexDragEnd(i, latlng) {
    if (i == null || !this._dragOriginVertices)
      return;
    // Drag-to-merge: splice the dragged vertex out and rebuild from scratch.
    // Rebuild covers both the ghost-promoted case (need to swap ghost styling
    // for a real handle elsewhere) and the normal case (edge midpoints shift).
    if (this._mergeTargetIndex !== null) {
      const next = this._zone.vertices.filter((_, idx) => idx !== i);
      this._draggingIndex = null;
      this._dragOriginVertices = null;
      this._draggingHandle = null;
      this._mergeTargetIndex = null;
      this._commitVertices(next, "change");
      this._buildHandles();
      return;
    }
    const proposed = this._vertexFromLatLng(latlng);
    const clamped = this._clampProposed(i, proposed);
    const next = this._withVertex(i, clamped);
    const promotedFromGhost = this._vertexHandles.length !== next.length;
    this._draggingIndex = null;
    this._dragOriginVertices = null;
    this._draggingHandle = null;
    this._commitVertices(next, "change");
    // Ghost-promoted drag: vertex count grew by one, so the ghost-styled
    // marker needs to be replaced by a real handle + two fresh ghosts on
    // the new edges. For a normal drag, count is unchanged and we can just
    // snap the idle handles to their committed positions.
    if (promotedFromGhost)
      this._buildHandles();
    else
      this._repositionIdleHandles();
  }

  // === Ghost drag (insert new vertex on edge i) ====================================

  // Splice the new vertex in at i+1 (between vertices[i] and vertices[i+1])
  // and rewire the in-flight drag to that new index. Leaflet still owns the
  // ghost marker for the duration of the drag — onDragEnd will rebuild the
  // handle set to swap the ghost styling for a real vertex handle.
  _onGhostDragStart(i) {
    if (this._zone.vertices.length >= MAX_VERTICES)
      return;
    const newVertex = this._edgeMidpointVertex(i);
    const next = this._zone.vertices.map((v) => ({ ...v }));
    const insertAt = i + 1;
    next.splice(insertAt, 0, newVertex);
    this._zone = new PolygonZone({ vertices: next });
    this._layer.setLatLngs(this._renderLatLngs());
    this._draggingIndex = insertAt;
    this._dragOriginVertices = next.map((v) => ({ ...v }));
    this._draggingHandle = this._ghostHandles[i];
  }

  // === Lifecycle hooks called by AnchorOverlay =====================================

  update({ zone, anchorPosition }) {
    // Mid-drag, our local state IS the authoritative state. The onInput we
    // emit every drag frame round-trips through AppState → updateMap and
    // lands back here as the incoming `zone` — applying it would trigger
    // _buildHandles() (the vertex count grew when a ghost was promoted),
    // which would destroy the marker Leaflet is currently dragging.
    if (this._draggingIndex !== null)
      return;

    const zoneChanged = zone && zone !== this._zone;
    const anchorChanged =
      anchorPosition &&
      (anchorPosition.lat !== this._anchorPosition?.lat ||
        anchorPosition.lng !== this._anchorPosition?.lng);

    if (zone)
      this._zone = zone;
    if (anchorPosition)
      this._anchorPosition = anchorPosition;

    // Anchor moving doesn't change vertex storage (it's anchor-relative);
    // we only need to re-render. Same for a fresh zone from appState.
    if (zoneChanged || anchorChanged) {
      this._layer.setLatLngs(this._renderLatLngs());
      // Vertex count may have changed (e.g. external setZone) — rebuild
      // handles when so, otherwise just reposition the idle ones.
      if (zoneChanged && this._vertexHandles.length !== this._zone.vertices.length)
        this._buildHandles();
      else
        this._repositionIdleHandles();
    }
  }

  setColor(color) {
    if (color === this._color)
      return;
    this._color = color;
    this._layer.setStyle({ color });
    for (const h of this._vertexHandles)
      h.setStyle({ color });
    for (const h of this._ghostHandles)
      h.setStyle({ color });
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
    this._destroyHandles();
    this._map.removeLayer(this._layer);
  }
}

// Build a regular N-gon with vertex 0 due north. Used by PolygonZoneControls
// on reset and by ControlToolbar when the user picks polygon from the
// shape dropdown.
export function regularPolygonVertices(sides, radius) {
  const n = Math.max(MIN_VERTICES, Math.min(MAX_VERTICES, Math.round(sides)));
  const r = Math.max(1, Number(radius) || 60);
  const out = [];
  for (let i = 0; i < n; i++)
    out.push({ bearing: (i * 360) / n, distance: r });
  return out;
}
