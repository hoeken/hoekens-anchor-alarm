// AnchorOverlay owns the on-map visualization of the anchor: the anchor
// marker (when dropped) or the draggable crosshair (when raised), the
// bow-to-anchor line (with distance + bearing labels), and a per-shape
// watch-zone overlay. The host drives it with drop/raise transitions and
// per-tick boat updates; alarm color is recomputed internally on any state
// or position change. The zone layer is delegated to a zone-specific class
// in ./zones/ — to add a new shape, register it there. The visualization
// also declutters itself: everything but the crosshair hides once it
// projects too small on screen (see MIN_ONSCREEN_SIZE_PX), and the line
// labels hide when they'd overlap the boat icon.

import { GeoMath } from "../GeoMath.js";
import { DisplayUnit } from "../DisplayUnit.js";
import { createZoneOverlay } from "./zones/index.js";
import { rectsOverlap } from "./FleetLayer.js";

// Hide the anchor visualization once its whole on-screen footprint (watch
// zone or bow-to-anchor line, whichever is larger) shrinks below this many
// pixels. Zoomed out that far the zone paints as a blob buried under the
// boat icon (32px minimum) and the 20px zone handles — a pixel measure adapts
// to the zone's real size where a fixed zoom cutoff wouldn't. Everything
// anchor-related carries the anchor-overlay-part class and is hidden by one
// container class (see hide-anchor-overlay in style.css); the raised-state
// crosshair is exempt because a fixed-size drag control stays useful at any
// zoom.
const MIN_ONSCREEN_SIZE_PX = 48;

// DivIcon (not L.icon) so we can rotate the inner <img> via CSS transform
// without clobbering the translate3d that Leaflet sets on the marker element.
const ANCHOR_ICON = L.divIcon({
  className: "anchor-overlay-part",
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
  constructor({ state, map, getBoatIcon, onZoneChange, onZoneInput }) {
    this.state = state;
    this.map = map;
    // Returns the own-boat icon's <img> (owned by FleetLayer) so the line
    // labels can hide themselves when they'd paint across the hull.
    this._getBoatIcon = getBoatIcon;
    this._onZoneChange = onZoneChange;
    this._onZoneInput = onZoneInput;
    this.dropped = false;

    this.anchorPosition = map.getCenter();
    this.boatPosition = null;
    this.heading = 0;
    this.gpsOffsets = { x: 0, y: 0 };

    this.zoneOverlay = null;
    this._zoneType = null;
    this._zone = null;

    // The bow-to-anchor line. Its distance/bearing labels are HTML markers
    // (see _ensureLineLabels), not SVG textpath: HTML text takes the same
    // soft text-shadow halo as the boat name labels, while SVG text's only
    // halo option is an opaque per-glyph stroke that paints over neighboring
    // letters and was hard to read.
    this.anchorLine = L.polyline([this.anchorPosition, this.anchorPosition], {
      color: "grey",
      weight: 2,
      className: "anchor-overlay-part",
    }).addTo(map);

    this.distanceLabel = null;
    this.bearingLabel = null;

    this.anchorMarker = null;
    this.crosshairMarker = null;

    this._cachedColor = null;

    // The two pixel-space decisions — the cluster's on-screen footprint and
    // the labels' overlap with the boat icon — change with scale, not just
    // with data ticks. Re-evaluate as soon as a zoom lands instead of waiting
    // up to a full update tick (by zoomend the BoatMarker has already resized
    // itself via its own "zoom" listener, so the measurement is fresh).
    map.on("zoomend", () => {
      this._refreshLine();
      this._refreshVisibility();
    });
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

    // Anonymous users see the zone but get no draggable edit handles (the
    // setZone POST is auth-gated server-side anyway). Reapply every tick so a
    // freshly-swapped overlay picks up the current login state.
    this.zoneOverlay?.setHandlesVisible(appState.loggedIn);

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
      // Still raised — zone shape may have changed via the toolbar.
      this.zoneOverlay.update({ zone: this._zone, anchorPosition: this.anchorPosition });
    }

    this._refreshColor();
    this._refreshVisibility();
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
    this._refreshVisibility();
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
      onChange: this._onZoneChange,
      onInput: this._onZoneInput,
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
      // Dragging the crosshair stretches the line: an overlay hidden as
      // too-small can become useful again mid-drag (and vice versa).
      this._refreshVisibility();
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

    const { bow, distance, bearing: bearingTrue } = GeoMath.bowToAnchor(
      this.boatPosition,
      this.heading,
      this.gpsOffsets,
      this.anchorPosition,
    );

    this.anchorLine.setLatLngs([bow, this.anchorPosition]);

    const bowToAnchor = Math.round(distance * 10) / 10;
    // Glue the unit to the number ("50.8m", not "50.8 m") — with the halo'd
    // text over map tiles, the gap breaks the short label apart visually.
    const distanceText = DisplayUnit.formatValue(bowToAnchor, "depth").replace(
      " ",
      "",
    );

    const bearing = Math.round(bearingTrue);
    const bearingText = `${bearing}°`;

    // Rotate so the anchor's ring (top of icon, at iconAnchor [12,4]) faces
    // back toward the bow; the flukes trail away from the rode.
    this._updateAnchorRotation(bearing + 180);

    // Labels read along the line. Web Mercator is conformal, so the true
    // bearing maps straight to a screen angle (CSS 0° = reading left→right =
    // due east, hence the -90) and stays valid across zooms. When the line
    // points westish the text would come out upside-down: spin it 180° and
    // mirror the perpendicular offset so each label keeps to its own side of
    // the line.
    let angle = bearing - 90;
    let side = 1;
    const norm = ((angle % 360) + 360) % 360;
    if (norm > 90 && norm < 270) {
      angle -= 180;
      side = -1;
    }

    // Midpoint by simple average — bow-to-anchor spans are far too short for
    // geodesic error to show. (Degenerate across the antimeridian, but so is
    // the polyline itself.)
    const mid = L.latLng(
      (bow.lat + this.anchorPosition.lat) / 2,
      (bow.lng + this.anchorPosition.lng) / 2,
    );

    this._ensureLineLabels();
    this._updateLineLabel(this.distanceLabel, distanceText, mid, angle, 10 * side);
    this._updateLineLabel(this.bearingLabel, bearingText, mid, angle, -10 * side);
    this._refreshLabelCollisions();
  }

  // The labels ride the line's midpoint, which lands on the hull whenever the
  // boat hangs close over its anchor — hide whichever label would overlap the
  // boat icon rather than paint text across it. Rect-vs-rect like FleetLayer's
  // name-label collisions: both getBoundingClientRects are post-transform, so
  // the label's reading rotation and the hull's heading are accounted for.
  _refreshLabelCollisions() {
    const boatIcon = this._getBoatIcon ? this._getBoatIcon() : null;
    if (!boatIcon)
      return;
    const boatRect = boatIcon.getBoundingClientRect();
    for (const marker of [this.distanceLabel, this.bearingLabel]) {
      const label = marker.getElement()?.firstChild;
      if (!label)
        continue;
      label.classList.toggle(
        "label-collision-hidden",
        rectsOverlap(label.getBoundingClientRect(), boatRect),
      );
    }
  }

  // Toggle the whole overlay (line, labels, anchor icon, zone outline and
  // handles — everything tagged anchor-overlay-part) off once its on-screen
  // footprint is too small to be useful, via one container class so a single
  // CSS rule covers layers spread across Leaflet's panes. visibility:hidden
  // also swallows pointer events, so buried zone handles can't grab a drag
  // aimed at the boat.
  _refreshVisibility() {
    let sizePx = 0;
    if (this.zoneOverlay) {
      const bounds = this.zoneOverlay.getBounds();
      const nw = this.map.latLngToContainerPoint(bounds.getNorthWest());
      const se = this.map.latLngToContainerPoint(bounds.getSouthEast());
      sizePx = Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
    }
    const [lineStart, lineEnd] = this.anchorLine.getLatLngs();
    if (lineStart && lineEnd) {
      const a = this.map.latLngToContainerPoint(lineStart);
      const b = this.map.latLngToContainerPoint(lineEnd);
      sizePx = Math.max(sizePx, a.distanceTo(b));
    }
    this.map
      .getContainer()
      .classList.toggle("hide-anchor-overlay", sizePx < MIN_ONSCREEN_SIZE_PX);
  }

  // The two line labels are created lazily on the first refresh with a known
  // boat position, then live for the overlay's lifetime like the line itself.
  _ensureLineLabels() {
    if (this.distanceLabel)
      return;
    this.distanceLabel = this._createLineLabel();
    this.bearingLabel = this._createLineLabel();
  }

  _createLineLabel() {
    // DivIcon wrapper for the same reason as ANCHOR_ICON: Leaflet owns the
    // outer element's transform for positioning, so ours must live on an
    // inner element.
    return L.marker(this.anchorPosition, {
      icon: L.divIcon({
        className: "anchor-overlay-part",
        html: '<div class="anchor-line-label"></div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(this.map);
  }

  _updateLineLabel(marker, text, latlng, angle, offset) {
    marker.setLatLng(latlng);
    const el = marker.getElement();
    const label = el && el.firstChild;
    if (!label)
      return;
    label.textContent = text;
    // Order matters: center the label box on the marker point first, then
    // rotate the reading direction, then push it out perpendicular to the
    // line.
    label.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(${offset}px)`;
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
