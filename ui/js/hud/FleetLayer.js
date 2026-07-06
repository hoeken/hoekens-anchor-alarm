// FleetLayer owns every vessel marker and history hotline on the map,
// including our own. The host drives it with three inputs: a one-shot bulk
// history load from /tracks, per-tick own-position append, and a live feed of
// other vessels. Out-of-range AIS vessels are removed on each sync; the own
// boat is never auto-removed (its mmsi key never appears in the AIS list).
//
// The other-vessel feed has two modes, chosen by config.connectionType:
//   REST      — poll the whole /vessels tree every POLL_INTERVAL_MS (legacy).
//   WEBSOCKET — seed a per-vessel cache once from /vessels, then keep it live
//               from the vessels.* delta subscription (ingestVesselDelta). A
//               slow timer prunes vessels that have gone silent and re-renders
//               the cache through the same syncOtherVessels path REST uses.
// Both modes ultimately hand syncOtherVessels a { key -> vessel-tree } dict, so
// marker/track reconciliation is identical regardless of transport.

import simplify from "simplify-js";
import { bearing, distance, point, radiansToDegrees } from "@turf/turf";
import { SignalKHelper } from "../SignalKHelper.js";
import { BoatConfig } from "../BoatConfig.js";
import { DisplayUnit } from "../DisplayUnit.js";

const POLL_INTERVAL_MS = 5000;
// WebSocket mode: how often to prune silent vessels and re-render the delta-fed
// cache. Decoupled from the delta arrival rate so a busy anchorage doesn't
// trigger a redraw per message.
const CACHE_SYNC_INTERVAL_MS = 1000;
// WebSocket mode: drop a vessel we haven't heard a delta from in this long.
// Replaces REST mode's implicit "absent from the latest snapshot" removal.
// Generous enough not to flicker anchored Class B neighbours (whose position
// reports can be minutes apart); departures within radius linger up to this
// long, but out-of-radius vessels are still removed the instant they move.
const VESSEL_TTL_MS = 6 * 60 * 1000;
const DEFAULT_FILTER_RADIUS = 500;
// Name labels only show once boats are zoomed in enough to be visually
// distinct; below this they'd just clutter the map.
const LABEL_MIN_ZOOM = 16;
const SIMPLIFY_TOLERANCE_SELF = 0.000002;
const SIMPLIFY_TOLERANCE_OTHERS = 0.00001;
const SIMPLIFY_THRESHOLD_SELF = 10000;
const SIMPLIFY_THRESHOLD_OTHERS = 1000;

// Track styling. Hotlines render to a single shared canvas (the plugin's
// default renderer is one instance, see leaflet.hotline.js), so there are no
// per-track DOM nodes to style with CSS — dimming/highlighting is done by
// swapping each hotline's palette/weight and redrawing.
const TRACK_PALETTE = { 0.0: "red", 0.5: "yellow", 1.0: "green" };
const DIM_PALETTE = { 0.0: "#bbb", 1.0: "#bbb" };
const TRACK_WEIGHT = 1;
const SELECTED_WEIGHT = 2;
const DIM_WEIGHT = 1;
// The drawn track is only 1px wide, giving a ~0.5px native hit target. Widen
// the hover/hit tolerance so the historical path is actually hoverable.
const TRACK_HOVER_TOLERANCE = 8;

const GPS_ANTENNA_ICON = L.divIcon({
  className: "gps-antenna-dot",
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="#000" viewBox="0 0 16 16" style="display:block"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});
export class FleetLayer {
  constructor({ app, map, ownMmsi, filterRadius }) {
    this.app = app;
    this.map = map;
    this.ownMmsi = ownMmsi;
    this.vessels = {}; // mmsi -> L.BoatMarker (with .gpsAntennaMarker attached)
    this.vesselTracks = {}; // mmsi -> L.hotline
    this.trackPointCounts = {}; // mmsi -> current point count in the hotline
    this.ownVessel = undefined;
    this.ownAntenna = undefined;
    this.ownBoatConfig = undefined;
    this.fleetTimer = null;
    this._pollInFlight = false;
    this.useWebsocket = this.app.config.connectionType === "WEBSOCKET";
    // WebSocket mode only: mmsi -> vessel tree, shaped like a /vessels payload
    // entry and built from deltas + a REST seed. Each entry carries a numeric
    // _lastSeen for TTL pruning. Unused in REST mode.
    this.vesselCache = {};
    this._staticFetches = new Set(); // mmsis with an in-flight static fetch
    this.filterRadius = filterRadius ?? DEFAULT_FILTER_RADIUS;
    this.selectedMmsi = null; // mmsi of the vessel whose popup is open, or null
    this.hoveredMmsi = null; // mmsi of the vessel/track under the cursor, or null

    this.setOwnVessel(this.app.state.getPosition(), this.app.state.boatConfig);

    // A vessel is "selected" while its info popup is open. Highlight that
    // boat's track and dim the rest; restore everything when it closes.
    this.map.on("popupopen", (e) => {
      const mmsi = e.popup?._source?.vesselMmsi;
      if (mmsi)
        this.setSelectedTrack(mmsi);
    });
    this.map.on("popupclose", (e) => {
      const mmsi = e.popup?._source?.vesselMmsi;
      if (mmsi && mmsi === this.selectedMmsi)
        this.setSelectedTrack(null);
    });

    // Toggle name-label visibility on zoom. Class lives on the map container so
    // a single CSS rule hides every label at once.
    this.map.on("zoomend", () => this.updateLabelVisibility());
    this.updateLabelVisibility();

    this.loadInitialData();
  }

  updateLabelVisibility() {
    const show = this.map.getZoom() >= LABEL_MIN_ZOOM;
    this.map
      .getContainer()
      .classList.toggle("hide-boat-labels", !show);
  }

  loadInitialData() {
    this.app.signalK
      .fetchTracks(this.filterRadius)
      .then((tracks) => {
        this.app.statusBar.clear("tracks-plugin");
        this.loadHistoricalTracks(
          tracks,
          this.app.state.getPosition(),
          this.filterRadius,
        );
      })
      .catch((err) => {
        const detail = err.statusText || err.message || "unknown error";
        this.app.statusBar.set(
          "tracks-plugin",
          `Tracks plugin not available: ${detail}`,
          "warning",
        );
      });

    if (this.useWebsocket) {
      // Seed names/dimensions/positions once, then let deltas keep the cache
      // live; the timer prunes silent vessels and re-renders from the cache.
      this.seedFleet();
      this.fleetTimer = setInterval(
        () => this.renderFromCache(),
        CACHE_SYNC_INTERVAL_MS,
      );
    } else {
      this.fleetTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
      this.poll();
    }
  }

  // WebSocket mode: one-shot seed of the vessel cache so BoatConfig has real
  // names/dimensions before the (dynamic-only) delta stream fills in the rest.
  seedFleet() {
    this.app.signalK
      .fetchAllVessels()
      .then((vessels) => {
        this.app.statusBar.clear("fleet-poll");
        const now = Date.now();
        for (const key in vessels) {
          const vessel = vessels[key];
          if (!vessel || vessel.mmsi == this.ownMmsi)
            continue;
          const mmsi = vessel.mmsi ?? this.mmsiFromContext(key);
          if (!mmsi)
            continue;
          vessel._lastSeen = now;
          this.vesselCache[String(mmsi)] = vessel;
        }
        this.renderFromCache();
      })
      .catch((error) => this.reportFleetError(error));
  }

  // WebSocket mode: fold one context's dynamic deltas into the cache. A vessel
  // seen for the first time is created from its context mmsi and gets a targeted
  // static fetch (name/design/sensors), since those aren't in the delta stream.
  ingestVesselDelta(context, timestamp, values) {
    const mmsi = this.mmsiFromContext(context);
    if (!mmsi || mmsi == this.ownMmsi)
      return;

    let vessel = this.vesselCache[mmsi];
    if (!vessel) {
      vessel = this.vesselCache[mmsi] = { mmsi };
      this.fetchVesselStatic(context, mmsi);
    }
    vessel._lastSeen = Date.now();
    for (const { path, value } of values)
      writeDeltaPath(vessel, path, value, timestamp);
  }

  // WebSocket mode: seed a newly-sighted vessel's static tree with one targeted
  // /vessels/<id> fetch. Only static branches are merged so it can't clobber
  // fresher positions that arrived while the request was in flight.
  fetchVesselStatic(context, mmsi) {
    if (this._staticFetches.has(mmsi))
      return;
    this._staticFetches.add(mmsi);
    this.app.signalK
      .fetchVessel(context)
      .then((data) => {
        const vessel = this.vesselCache[mmsi];
        if (!vessel)
          return; // pruned before the fetch resolved
        if (data.name != null)
          vessel.name = data.name;
        if (data.mmsi != null)
          vessel.mmsi = data.mmsi;
        if (data.design)
          vessel.design = data.design;
        if (data.sensors)
          vessel.sensors = data.sensors;
      })
      .catch(() => { }) // static stays at BoatConfig defaults; not worth surfacing
      .finally(() => this._staticFetches.delete(mmsi));
  }

  // WebSocket mode: drop vessels gone silent past the TTL, then reconcile the
  // cache through the same path REST uses. syncOtherVessels' own "absent from
  // the payload" removal then clears markers for both pruned and out-of-radius
  // vessels — no snapshot needed.
  renderFromCache() {
    const now = Date.now();
    for (const mmsi in this.vesselCache) {
      if (now - this.vesselCache[mmsi]._lastSeen > VESSEL_TTL_MS)
        delete this.vesselCache[mmsi];
    }
    this.syncOtherVessels(this.vesselCache, {
      ownLatLng: this.app.state.getPosition(),
      filterRadius: this.filterRadius,
      twa: this.app.state.twa,
    });
  }

  // The mmsi digits from a stream context / vessel key, or null for a vessel
  // with no MMSI (e.g. a uuid-only context — not an AIS target we render).
  mmsiFromContext(context) {
    const match = String(context).match(/urn:mrn:imo:mmsi:(\d+)/);
    return match ? match[1] : null;
  }

  reportFleetError(error) {
    const detail = error.statusText || error.message || "unknown error";
    const status = error.status ? `${error.status} ` : "";
    const msg = `Fleet update failed: ${status}${detail}`;
    this.app.statusBar.set("fleet-poll", msg, "warning");
    console.error(msg, error);
  }

  poll() {
    if (this._pollInFlight)
      return;
    this._pollInFlight = true;
    this.app.signalK
      .fetchAllVessels()
      .then((vessels) => {
        this.app.statusBar.clear("fleet-poll");
        this.syncOtherVessels(vessels, {
          ownLatLng: this.app.state.getPosition(),
          filterRadius: this.filterRadius,
          twa: this.app.state.twa,
        });
      })
      .catch((error) => this.reportFleetError(error))
      .finally(() => {
        this._pollInFlight = false;
      });
  }

  update(state) {
    this.updateOwnPosition(state.getPosition(), state.boatConfig.heading);
    const pos = state.getPosition();
    this.addPointToTrack(this.ownMmsi, pos.lat, pos.lng);
  }

  // Own boat is kept outside the AIS vessels dict so syncOtherVessels never
  // removes it.
  setOwnVessel(coords, boatConfig) {
    this.ownBoatConfig = boatConfig;
    this.ownVessel = new L.BoatMarker(coords, {
      beam: boatConfig.beam,
      loa: boatConfig.loa,
      gpsOffset: boatConfig.bowOffset,
      heading: boatConfig.heading,
      icon: boatConfig.icon,
    }).addTo(this.map);

    // Hovering our own boat highlights its track, mirroring AIS vessels.
    this.ownVessel.on("mouseover", () => this.setHoveredTrack(this.ownMmsi));
    this.ownVessel.on("mouseout", () => this.setHoveredTrack(null));

    this.ownAntenna = L.marker(coords, {
      icon: GPS_ANTENNA_ICON,
      interactive: false,
    }).addTo(this.map);
  }

  updateOwnPosition(coords, heading) {
    this.ownVessel.setLatLng(coords);
    this.ownVessel.setHeading(heading);
    this.ownAntenna.setLatLng(coords);
  }

  // Initial bulk history load from /tracks. Includes self.
  loadHistoricalTracks(tracks, ownLatLng, filterRadius) {
    const mmsiRegex = /urn:mrn:imo:mmsi:(\d+)$/;
    for (let uri in tracks) {
      const match = uri.match(mmsiRegex);
      if (!match)
        continue;
      const mmsi = match[1];
      const data = tracks[uri];

      const history = data.coordinates?.[0];
      if (!history || !history.length)
        continue;

      const points = [];
      let i = 0;
      for (let position of history) {
        const lat = position[1];
        const lon = position[0];
        const dist = distance(
          point([ownLatLng.lng, ownLatLng.lat]),
          point([lon, lat]),
          { units: "meters" },
        );
        if (dist < filterRadius) {
          points.push([lat, lon, i]);
          i++;
        }
      }

      if (!points.length)
        continue;
      this.vesselTracks[mmsi] = this.createTrack(points, points.length, mmsi);
      this.trackPointCounts[mmsi] = this.vesselTracks[mmsi].getLatLngs().length;
    }
  }

  // Single entry point for extending any vessel track. Handles dedupe,
  // threshold-triggered simplification
  addPointToTrack(mmsi, lat, lng) {
    const track = this.vesselTracks[mmsi];
    if (!track)
      return;

    // Index the last point directly rather than Array.prototype.at(-1):
    // .at() is Chrome 92+ and absent on the Navico MFD engine (Chromium 69),
    // where calling it threw and broke track rendering.
    const latLngs = track.getLatLngs();
    const last = latLngs[latLngs.length - 1];
    if (last && last.lat === lat && last.lng === lng)
      return;

    track.addLatLng([lat, lng, track.options.max]);
    track.options.max++;
    this.trackPointCounts[mmsi] = (this.trackPointCounts[mmsi] || 0) + 1;

    if (this.trackPointCounts[mmsi] >= this.getSimplifyThreshold(mmsi))
      this.simplifyTrack(mmsi);
  }

  simplifyTrack(mmsi) {
    const track = this.vesselTracks[mmsi];
    if (!track)
      return;
    const simplified = simplifyHotlinePoints(
      track.getLatLngs(),
      this.getSimplifyTolerance(mmsi),
    );
    track.setLatLngs(simplified);
    this.trackPointCounts[mmsi] = simplified.length;
  }

  // Reconcile other-vessel markers and tracks against a fresh /vessels payload.
  syncOtherVessels(vessels, { ownLatLng, filterRadius, twa }) {
    const detected = [];

    for (let key in vessels) {
      const vessel = vessels[key];
      if (vessel.mmsi == this.ownMmsi)
        continue;
      if (!("navigation" in vessel) || !("position" in vessel.navigation))
        continue;

      const position = vessel.navigation.position.value;
      const dist = distance(
        point([position.longitude, position.latitude]),
        point([ownLatLng.lng, ownLatLng.lat]),
        { units: "meters" },
      );
      if (dist > filterRadius)
        continue;

      // Bearing in degrees from our position to the vessel, normalized to 0-360.
      const brng = Math.round(
        (bearing(
          point([ownLatLng.lng, ownLatLng.lat]),
          point([position.longitude, position.latitude]),
        ) + 360) % 360,
      );

      detected.push(vessel.mmsi);
      const heading = this.deriveVesselHeading(vessel, twa);
      const distanceRounded = Math.round(dist);

      if (vessel.mmsi in this.vessels) {
        this.updateExistingVessel(vessel, position, heading, distanceRounded, brng);
      } else {
        this.addNewVessel(vessel, position, heading, distanceRounded, brng);
      }
    }

    // Drop vessels that left the radius.
    const detectedSet = new Set(detected.map(String));
    for (let mmsi in this.vessels) {
      if (!detectedSet.has(mmsi)) {
        const marker = this.vessels[mmsi];
        if (marker.gpsAntennaMarker)
          this.map.removeLayer(marker.gpsAntennaMarker);
        this.map.removeLayer(marker);
        delete this.vessels[mmsi];
        if (this.vesselTracks[mmsi]) {
          this.map.removeLayer(this.vesselTracks[mmsi]);
          delete this.vesselTracks[mmsi];
          delete this.trackPointCounts[mmsi];
        }
      }
    }
  }

  // Heading preference: true heading > COG (only if moving) > observer's TWA > 0.
  // COG is wonky at low speed, so we gate it on SOG > 1 knot.
  deriveVesselHeading(vessel, twa) {
    const sogVal = SignalKHelper.value(vessel, "navigation.speedOverGround");

    const headingTrue = SignalKHelper.value(vessel, "navigation.headingTrue");
    if (headingTrue !== undefined)
      return radiansToDegrees(headingTrue);

    const cog = SignalKHelper.value(vessel, "navigation.courseOverGroundTrue");
    if (cog !== undefined && sogVal > 0.5)
      return radiansToDegrees(cog);

    if (twa)
      return radiansToDegrees(twa.value);
    return 0;
  }

  updateExistingVessel(vessel, position, heading, distance, bearing) {
    const marker = this.vessels[vessel.mmsi];
    marker.setLatLng([position.latitude, position.longitude]);
    marker.setHeading(heading);

    const config = BoatConfig.extract(vessel);
    // Static data (AIS ship type, dimensions) can land after the marker was
    // first drawn from defaults — a WebSocket position delta creates the vessel
    // before its static fetch resolves, and REST polls can also fill in design
    // late. Re-apply icon + hull geometry so the marker reflects the real type.
    marker.setBoatIcon(config.icon);
    marker.setDimensions({
      beam: config.beam,
      loa: config.loa,
      gpsOffset: config.bowOffset,
    });
    this.setVesselInfo(marker.vesselInfo, config, distance, bearing);
    if (marker.getTooltip()?.getContent() !== config.name)
      marker.setTooltipContent(config.name);
    marker.gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

    this.addPointToTrack(vessel.mmsi, position.latitude, position.longitude);
  }

  addNewVessel(vessel, position, heading, distance, bearing) {
    const config = BoatConfig.extract(vessel);

    const marker = new L.BoatMarker([position.latitude, position.longitude], {
      beam: config.beam,
      loa: config.loa,
      gpsOffset: config.bowOffset,
      heading: heading,
      icon: config.icon,
    });
    marker.vesselMmsi = String(vessel.mmsi);
    marker.vesselInfo = this.buildVesselInfo(config, distance, bearing);
    marker.addTo(this.map).bindPopup(marker.vesselInfo);

    // Hovering the boat icon highlights its track, same style as selection.
    marker.on("mouseover", () => this.setHoveredTrack(marker.vesselMmsi));
    marker.on("mouseout", () => this.setHoveredTrack(null));

    // Clickable name label above the icon. The permanent tooltip auto-tracks
    // the marker on setLatLng; an explicit handler opens the same popup as the
    // marker since tooltip clicks don't bubble to the marker. BoatMarker owns
    // the offset, keeping the label centered over the hull (not the antenna)
    // and clear of the icon as the boat rotates.
    marker.bindTooltip(config.name, {
      permanent: true,
      direction: "top",
      interactive: true,
      className: "boat-name-label",
    });
    marker.on("tooltipopen", (e) => {
      const el = e.tooltip.getElement();
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        marker.openPopup();
      });
      // Hovering the name label highlights the track, same as the icon.
      el.addEventListener("mouseenter", () =>
        this.setHoveredTrack(marker.vesselMmsi),
      );
      el.addEventListener("mouseleave", () => this.setHoveredTrack(null));
    });

    marker.gpsAntennaMarker = L.marker(
      [position.latitude, position.longitude],
      {
        icon: GPS_ANTENNA_ICON,
        interactive: false,
      },
    ).addTo(this.map);

    this.vessels[vessel.mmsi] = marker;

    // The history load may have already created a track for this mmsi.
    if (!(vessel.mmsi in this.vesselTracks)) {
      this.vesselTracks[vessel.mmsi] = this.createTrack(
        [[position.latitude, position.longitude, 0]],
        1,
        vessel.mmsi,
      );
      this.trackPointCounts[vessel.mmsi] = 1;
    }
  }

  // Build the popup as a live DOM element. The element is kept on the marker
  // so later syncs can update each field in place via setVesselInfo instead of
  // replacing the whole popup body.
  buildVesselInfo(config, distance, bearing) {
    const el = document.createElement("div");
    el.innerHTML = `
      <h4 class="vesselName"><span class="vesselNameText"></span><span class="mmsi"><span class="mmsiLabel">MMSI</span><a class="mmsiNum" target="_blank" rel="noopener"></a></span></h4>
      <table class="vesselData">
        <tr>
          <td><b>Length:</b></td><td align="right" class="field-loa"></td>
          <td><b>Beam:</b></td><td align="right" class="field-beam"></td>
        </tr>
        <tr>
          <td><b>Distance:</b></td><td align="right" class="field-distance"></td>
          <td><b>Bearing:</b></td><td align="right" class="field-bearing"></td>
        </tr>
        <tr>
          <td><b>SOG:</b></td><td align="right" class="field-sog"></td>
          <td><b>COG:</b></td><td align="right" class="field-cog"></td>
        </tr>
      </table>
    `;
    this.setVesselInfo(el, config, distance, bearing);
    return el;
  }

  setVesselInfo(el, config, distance, bearing) {
    const distanceUnit = distance > 1000 ? "distance" : "length";
    // Only rewrite a field when its value actually changed.
    const setText = (sel, value) => {
      const node = el.querySelector(sel);
      if (node.textContent !== value)
        node.textContent = value;
    };
    setText(".vesselNameText", config.name);
    setText(".mmsiNum", String(config.mmsi));
    const mmsiLink = el.querySelector(".mmsiNum");
    const mmsiHref = `https://www.vesselfinder.com/?mmsi=${config.mmsi}`;
    if (mmsiLink.getAttribute("href") !== mmsiHref)
      mmsiLink.setAttribute("href", mmsiHref);
    setText(".field-loa", DisplayUnit.formatValue(config.loa, "length"));
    setText(".field-beam", DisplayUnit.formatValue(config.beam, "length"));
    setText(".field-distance", DisplayUnit.formatValue(distance, distanceUnit));
    setText(".field-bearing", `${bearing}°`);
    setText(".field-sog", DisplayUnit.formatValue(config.sog, "speed"));
    setText(".field-cog", DisplayUnit.formatValue(config.cog, "angle", 0));
  }

  // Bulk-load entry: pre-simplifies the input so a long history (e.g. a 24h
  // own-boat dwell with thousands of jitter samples) doesn't get drawn raw.
  createTrack(points, max, mmsi) {
    const simplified = simplifyHotlinePoints(points, this.getSimplifyTolerance(mmsi));
    const style = this.trackStyleFor(mmsi);
    const track = L.hotline(simplified, {
      color: "red",
      weight: style.weight,
      min: 0,
      max: max,
      palette: style.palette,
      outlineWidth: 0,
      text: "",
    }).addTo(this.map);

    // The 1px line gives a near-zero native hit target; widen it so the path
    // is hoverable. Hovering it highlights this track, same style as selection.
    track._clickTolerance = () => TRACK_HOVER_TOLERANCE;
    track.on("mouseover", () => this.setHoveredTrack(mmsi));
    track.on("mouseout", () => this.setHoveredTrack(null));
    return track;
  }

  // The mmsi whose track is currently highlighted. A pinned selection (open
  // popup) wins over a transient hover.
  highlightedMmsi() {
    return this.selectedMmsi || this.hoveredMmsi;
  }

  // Palette/weight a track should use given the current highlight. A boat is
  // highlighted via its open popup or by hover; mmsi keys are strings throughout.
  trackStyleFor(mmsi) {
    const highlighted = this.highlightedMmsi();
    if (!highlighted)
      return { palette: TRACK_PALETTE, weight: TRACK_WEIGHT };
    if (String(mmsi) === highlighted)
      return { palette: TRACK_PALETTE, weight: SELECTED_WEIGHT };
    return { palette: DIM_PALETTE, weight: DIM_WEIGHT };
  }

  // Restyle every track for the current highlight and redraw. All hotlines
  // share one canvas renderer, so the per-frame redraw coalesces.
  refreshTrackStyles() {
    for (let key in this.vesselTracks) {
      const track = this.vesselTracks[key];
      const style = this.trackStyleFor(key);
      track.options.palette = style.palette;
      track.options.weight = style.weight;
      track.redraw();
    }
  }

  // Pin one vessel's track highlight (popup open). Pass null to unpin.
  setSelectedTrack(mmsi) {
    this.selectedMmsi = mmsi ? String(mmsi) : null;
    this.refreshTrackStyles();
  }

  // Transiently highlight one vessel's track on hover. Pass null to clear.
  setHoveredTrack(mmsi) {
    const next = mmsi ? String(mmsi) : null;
    if (next === this.hoveredMmsi)
      return;
    this.hoveredMmsi = next;
    // A pinned selection takes precedence, so hover can't change what's drawn.
    if (this.selectedMmsi)
      return;
    this.refreshTrackStyles();
  }

  getSimplifyTolerance(mmsi) {
    if (mmsi === this.ownMmsi)
      return SIMPLIFY_TOLERANCE_SELF;
    else
      return SIMPLIFY_TOLERANCE_OTHERS;

  }

  getSimplifyThreshold(mmsi) {
    if (mmsi === this.ownMmsi)
      return SIMPLIFY_THRESHOLD_SELF;
    else
      return SIMPLIFY_THRESHOLD_OTHERS;
  }
}

// Accepts either [lat, lng, alt] tuples (from bulk history) or L.LatLng
// objects (from .getLatLngs()) and returns [lat, lng, alt] tuples preserving
// each retained point's original gradient index in alt.
function simplifyHotlinePoints(points, tolerance) {
  if (points.length < 3)
    return points.map(toTuple);
  const xy = points.map((p) => {
    const tuple = toTuple(p);
    return { x: tuple[0], y: tuple[1], alt: tuple[2] };
  });
  const simplified = simplify(xy, tolerance, true);
  return simplified.map((p) => [p.x, p.y, p.alt]);
}

function toTuple(p) {
  return Array.isArray(p) ? p : [p.lat, p.lng, p.alt];
}

// Fold one delta (path + value) into a vessel tree as a { value, timestamp }
// leaf, mirroring the /vessels REST shape so BoatConfig/syncOtherVessels read it
// unchanged. Reuses an existing envelope so any meta already on it survives.
function writeDeltaPath(vessel, path, value, timestamp) {
  const parts = path.split(".");
  let node = vessel;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node[parts[i]] == null || typeof node[parts[i]] !== "object")
      node[parts[i]] = {};
    node = node[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (node[leaf] && typeof node[leaf] === "object" && "value" in node[leaf]) {
    node[leaf].value = value;
    node[leaf].timestamp = timestamp;
  } else {
    node[leaf] = { value, timestamp };
  }
}
