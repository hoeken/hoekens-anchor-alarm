// FleetLayer owns every vessel marker and history hotline on the map,
// including our own. The host drives it with three inputs: a one-shot bulk
// history load from /tracks, per-tick own-position append, and a live feed of
// other vessels. Out-of-range AIS vessels are removed on each sync; the own
// boat is never auto-removed (its mmsi key never appears in the AIS list).
//
// The other-vessel feed seeds a per-vessel cache once from /vessels, then keeps
// it live from the vessels.* delta subscription (ingestVesselDelta). A newly-
// sighted vessel gets its own context subscription (subscribeVessel) so its
// static identity — name, ship type, dimensions — streams in live (the shared
// vessels.* subscription can't carry those; see AppState.websocketSubscribeFleet),
// plus a one-shot REST fetch (fetchVesselStatic) for an immediate snapshot while
// that subscription waits for the vessel's next AIS static report. The host
// seeds the cache from a bulk /vessels snapshot before each vessels.*
// subscription — the initial load's own fetch first, a fresh one on every
// reconnect (see AnchorAlarm.setupWebsockets) — so already-known vessels never
// look newly sighted and the per-vessel fetch fires only for genuinely new
// targets. A slow timer
// prunes vessels that have gone silent and re-renders the cache through
// syncOtherVessels, which reconciles markers/tracks against a
// { key -> vessel-tree } dict.

import simplify from "simplify-js";
import { bearing, distance, point, radiansToDegrees } from "@turf/turf";
import { SignalKHelper } from "../SignalKHelper.js";
import { BoatConfig } from "../BoatConfig.js";
import { DisplayUnit } from "../DisplayUnit.js";
import { GlitchFilter, describeGlitch } from "../../../shared/glitch-filter.js";

// How often to prune silent vessels and re-render the delta-fed cache.
// Decoupled from the delta arrival rate so a busy anchorage doesn't trigger a
// redraw per message.
const CACHE_SYNC_INTERVAL_MS = 1000;
// Drop a vessel we haven't heard a delta from in this long. Generous enough not
// to flicker anchored Class B neighbours (whose position reports can be minutes
// apart); departures within radius linger up to this long, but out-of-radius
// vessels are still removed the instant they move.
const VESSEL_TTL_MS = 30 * 60 * 1000;
const DEFAULT_FILTER_RADIUS = 500;
// Name labels are hidden only when they'd collide with a higher-priority
// label rather than by a blanket zoom cutoff — a sparse, far-off vessel keeps
// its name at any zoom, while a crowded anchorage sheds overlapping labels.
// The closest vessel to us wins a collision; ties resolve by MMSI so the
// choice is stable frame-to-frame (no flicker). This gap (in CSS px) is added
// around each label's box so kept labels never quite touch.
const LABEL_COLLISION_PADDING = 3;
const SIMPLIFY_TOLERANCE_SELF = 0.000002;
const SIMPLIFY_TOLERANCE_OTHERS = 0.00001;
const SIMPLIFY_THRESHOLD_SELF = 10000;
const SIMPLIFY_THRESHOLD_OTHERS = 1000;
// The /tracks payload carries bare coordinates with no timestamps, so when
// glitch-filtering bulk history we assume consecutive points are one second
// apart — the resolution the README recommends running the tracks plugin at —
// which turns the speed limit into a per-point distance limit.
const TRACK_POINT_INTERVAL_MS = 1000;

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
  constructor({ app, map, ownMmsi, filterRadius, showLabels, showOwnTrack, showOtherTracks, glitchFilterSpeed }) {
    this.app = app;
    this.map = map;
    this.ownMmsi = ownMmsi;
    // Max plausible speed (m/s, 0 = off) for the per-vessel glitch filters
    // that keep GPS spikes out of the cache and the tracks.
    this.glitchFilterSpeed = glitchFilterSpeed ?? 0;
    this.glitchFilters = {}; // mmsi -> GlitchFilter for live position deltas
    // Master on/off for name labels, layered on top of the zoom gate below.
    this.showLabels = showLabels ?? true;
    // Per-track visibility toggles: own boat vs everyone else. Hidden tracks
    // stay in this.vesselTracks (points keep accumulating); only their map
    // membership is toggled, so flipping back on redraws the full path.
    this.showOwnTrack = showOwnTrack ?? true;
    this.showOtherTracks = showOtherTracks ?? true;
    this.vessels = {}; // mmsi -> L.BoatMarker (with .gpsAntennaMarker attached)
    this.vesselTracks = {}; // mmsi -> L.hotline
    this.trackPointCounts = {}; // mmsi -> current point count in the hotline
    this.ownVessel = undefined;
    this.ownAntenna = undefined;
    this.ownBoatConfig = undefined;
    this.fleetTimer = null;
    // mmsi -> vessel tree, shaped like a /vessels payload entry and built from
    // deltas + a one-shot /vessels seed. Each entry carries a numeric _lastSeen
    // for TTL pruning.
    this.vesselCache = {};
    // mmsis we've sent a per-vessel context subscription for (see subscribeVessel).
    this._subscribedMmsis = new Set();
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

    // Re-evaluate which labels collide after any pan or zoom (moveend fires
    // after a zoom completes too). The set of vessels within view — and how
    // their labels overlap on screen — changes with the viewport, not just on
    // data ticks.
    this.map.on("moveend", () => this.updateLabelCollisions());
    this.updateLabelVisibility();

    this.loadInitialData();
  }

  // The master on/off switch, applied as a single container class so one CSS
  // rule blanks every label at once. Per-label collision hiding is layered on
  // top by updateLabelCollisions, which this defers to once the switch is on.
  updateLabelVisibility() {
    this.map
      .getContainer()
      .classList.toggle("hide-boat-labels", !this.showLabels);
    this.updateLabelCollisions();
  }

  // Hide only the labels that would overlap a higher-priority (closer) label,
  // independent of zoom. Greedy: walk the labels closest-first, keep each one
  // whose box clears every label already kept, and hide the rest. Reads every
  // box before touching the DOM so the visibility toggles (which don't affect
  // layout) can't force a reflow between measurements. A hidden label keeps its
  // layout box (visibility:hidden, not display:none), so it stays measurable
  // and can reclaim its spot on a later pass once the crowding clears.
  updateLabelCollisions() {
    // The master switch already blanks every label via the container class;
    // skip the per-label work (and its layout reads) while it's off.
    if (!this.showLabels)
      return;

    const labels = [];
    for (const mmsi in this.vessels) {
      const el = this.vessels[mmsi].getTooltip()?.getElement();
      if (!el)
        continue; // tooltip not opened onto the map yet
      labels.push({
        el,
        rect: el.getBoundingClientRect(),
        distance: this.vessels[mmsi]._labelDistance ?? Infinity,
        mmsi,
      });
    }

    // Closest wins a collision; MMSI breaks ties so ordering is stable frame to
    // frame and kept labels don't flicker as near-equal distances jitter.
    labels.sort(
      (a, b) => a.distance - b.distance || (a.mmsi < b.mmsi ? -1 : 1),
    );

    const kept = [];
    for (const label of labels) {
      const collides = kept.some((r) => rectsOverlap(r, label.rect));
      label.el.classList.toggle("label-collision-hidden", collides);
      if (!collides)
        kept.push(label.rect);
    }
  }

  // Flip the name-label master switch live (from the settings dialog).
  setShowLabels(show) {
    const next = show ?? true;
    if (next === this.showLabels)
      return;
    this.showLabels = next;
    this.updateLabelVisibility();
  }

  // Flip own-boat track visibility live (from the settings dialog).
  setShowOwnTrack(show) {
    const next = show ?? true;
    if (next === this.showOwnTrack)
      return;
    this.showOwnTrack = next;
    this.applyTrackVisibility();
  }

  // Flip other-vessel track visibility live (from the settings dialog).
  setShowOtherTracks(show) {
    const next = show ?? true;
    if (next === this.showOtherTracks)
      return;
    this.showOtherTracks = next;
    this.applyTrackVisibility();
  }

  // Apply a new glitch-filter speed live (from the settings dialog): update
  // every live filter and re-fetch the bulk history so the drawn tracks are
  // re-filtered at the new limit.
  setGlitchFilterSpeed(speed) {
    const next = Number(speed) || 0;
    if (next === this.glitchFilterSpeed)
      return;
    this.glitchFilterSpeed = next;
    for (const mmsi in this.glitchFilters)
      this.glitchFilters[mmsi].setMaxSpeed(next);
    this.fetchAndLoadTracks();
  }

  glitchFilterFor(mmsi) {
    const key = String(mmsi);
    if (!this.glitchFilters[key])
      this.glitchFilters[key] = new GlitchFilter(this.glitchFilterSpeed);
    return this.glitchFilters[key];
  }

  // Run one vessel's live fix through its glitch filter. A rejected fix shows
  // a status-bar error naming the vessel, cleared by its next good fix.
  // Returns whether the fix should be applied.
  filterVesselPosition(vessel, mmsi, position, timestamp) {
    const time = Date.parse(timestamp);
    const filter = this.glitchFilterFor(mmsi);
    const result = filter.check(
      position,
      Number.isFinite(time) ? time : Date.now(),
    );
    const name = vessel.name || `MMSI ${mmsi}`;

    const statusId = `glitch-${mmsi}`;
    if (result.accepted) {
      if (result.limitAccepted)
        console.warn(
          `Glitch filter: run limit reached — accepting ${name} fix at ${result.speed.toFixed(1)} m/s as real movement`,
        );
      this.app.statusBar.clear(statusId);
    } else {
      const speed =
        result.speed != null
          ? ` (${DisplayUnit.formatValue(result.speed, "speed")})`
          : "";
      this.app.statusBar.set(statusId, `${name}: position glitch ignored${speed}`);
      console.warn(
        `Glitch filter: rejected ${name} fix ${describeGlitch(filter, result, position)}`,
      );
    }
    return result.accepted;
  }

  // Track keys are MMSI strings; our own boat's track is the one keyed by
  // ownMmsi. Coerce both sides since history keys come in as strings and
  // ownMmsi originates from the boat config.
  isOwnTrack(mmsi) {
    return String(mmsi) === String(this.ownMmsi);
  }

  // Whether a track should currently be on the map, per the own/other toggles.
  trackVisible(mmsi) {
    return this.isOwnTrack(mmsi) ? this.showOwnTrack : this.showOtherTracks;
  }

  // Add/remove each existing track layer to match the current toggles. Tracks
  // are kept in this.vesselTracks either way, so a hidden track keeps
  // accumulating points and reappears intact when toggled back on.
  applyTrackVisibility() {
    for (const mmsi in this.vesselTracks) {
      const track = this.vesselTracks[mmsi];
      const shouldShow = this.trackVisible(mmsi);
      const onMap = this.map.hasLayer(track);
      if (shouldShow && !onMap)
        track.addTo(this.map);
      else if (!shouldShow && onMap)
        this.map.removeLayer(track);
    }
  }

  loadInitialData() {
    // Runs at construction, which the host sequences after the bulk /vessels
    // fetch has succeeded — the heavy /tracks request must not compete with
    // the initial load (see AnchorAlarm.loadInitialData).
    this.fetchAndLoadTracks();

    // The vessel cache seeds via seedFleet — from the initial-load /vessels
    // snapshot right after construction, and again on every websocket
    // reconnect (see AnchorAlarm.setupWebsockets); deltas then keep it live.
    // The timer prunes silent vessels and re-renders from the cache.
    this.fleetTimer = setInterval(
      () => this.renderFromCache(),
      CACHE_SYNC_INTERVAL_MS,
    );
  }

  // Fetch historical tracks for the current filter radius and draw them. Split
  // out of loadInitialData so setFilterRadius can re-run it on a radius change
  // without re-arming the fleet timer.
  fetchAndLoadTracks() {
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
        // A 404 just means the tracks plugin isn't installed — historical
        // fleet tracks are an optional extra, not something to warn about.
        if (err.status === 404) {
          this.app.statusBar.clear("tracks-plugin");
          return;
        }
        const detail = err.statusText || err.message || "unknown error";
        this.app.statusBar.set(
          "tracks-plugin",
          `Tracks plugin not available: ${detail}`,
          "warning",
        );
      });
  }

  // Apply a new fleet filter radius live (from the settings dialog). Re-fetch
  // historical tracks for the new radius and re-render the cached live vessels:
  // syncOtherVessels reads this.filterRadius fresh, so renderFromCache adds
  // newly-in-range vessels and drops those now outside.
  setFilterRadius(radius) {
    const next = radius ?? DEFAULT_FILTER_RADIUS;
    if (next === this.filterRadius)
      return;
    this.filterRadius = next;
    this.fetchAndLoadTracks();
    this.renderFromCache();
  }

  // Seed the vessel cache from a bulk /vessels snapshot so BoatConfig has
  // real names/dimensions for already-known targets before the delta stream
  // takes over keeping them (and newly-sighted vessels) current. On initial
  // load the host passes the snapshot it already fetched for own-boat state;
  // on reconnects it calls with no argument and a fresh one is fetched.
  // Either way the vessels.* subscription is gated on the returned promise,
  // which settles once the cache is seeded (resolving even on failure —
  // errors go to the status bar).
  seedFleet(vessels) {
    if (vessels) {
      this.applyFleetSnapshot(vessels);
      return Promise.resolve();
    }
    return this.app.signalK
      .fetchAllVessels()
      .then((fetched) => {
        this.app.statusBar.clear("fleet-poll");
        this.applyFleetSnapshot(fetched);
      })
      .catch((error) => this.reportFleetError(error));
  }

  // Fold a /vessels payload into the cache (own vessel excluded) and render.
  applyFleetSnapshot(vessels) {
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
      // Seed the vessel's glitch filter from the snapshot fix so its first
      // live delta is judged against it rather than accepted blind. The
      // envelope's own timestamp keeps the implied speed honest when the
      // snapshot is minutes old.
      const fix = vessel.navigation?.position;
      const fixTime = fix ? Date.parse(fix.timestamp) : NaN;
      if (fix?.value && Number.isFinite(fixTime))
        this.glitchFilterFor(mmsi).check(fix.value, fixTime);
      // Keep the seeded static data live as fresh AIS static reports arrive.
      this.subscribeVessel(mmsi);
    }
    this.renderFromCache();
  }

  // Fold one context's deltas into the cache. A vessel seen for the first time
  // is created from its context mmsi and gets two things: its own context
  // subscription (subscribeVessel), which streams the static identity paths —
  // name, design, sensors — that the shared vessels.* subscription can't carry,
  // and a one-shot REST fetch (fetchVesselStatic) for an immediate snapshot,
  // since the subscription only delivers those paths on the next (often minutes
  // away) AIS static report. Deltas only flow once the current connection's
  // /vessels seed has landed (see AnchorAlarm.setupWebsockets), so this
  // discovery path is reserved for vessels genuinely first heard over the
  // stream.
  ingestVesselDelta(context, timestamp, values) {
    const mmsi = this.mmsiFromContext(context);
    if (!mmsi || mmsi == this.ownMmsi)
      return;

    // console.log(mmsi, values[0].path, values[0].value);

    let vessel = this.vesselCache[mmsi];
    if (!vessel) {
      vessel = this.vesselCache[mmsi] = { mmsi };
      this.subscribeVessel(mmsi);
      this.fetchVesselStatic(context, mmsi);
    }
    vessel._lastSeen = Date.now();
    for (const { path, value } of values) {
      // Vessel-root attributes (name, mmsi, …) arrive as a delta with an EMPTY
      // path and the attribute(s) carried in the value object — e.g.
      // { name: 'ZEPHYR' } or { mmsi: '368124290' } — not as path "name"/"mmsi".
      // They live un-enveloped at the vessel root (matching the /vessels REST
      // shape BoatConfig and the cache key read), so merge each non-null key
      // straight onto the vessel rather than through the { value, timestamp }
      // leaf writer. Skip nulls so a stray empty delta can't wipe a good value.
      if (!path) {
        if (value && typeof value === "object") {
          for (const key in value) {
            if (value[key] != null)
              vessel[key] = value[key];
          }
        }
      } else if (path === "name" || path === "mmsi") {
        // Some SignalK versions send these with an explicit path instead.
        if (value != null)
          vessel[path] = value;
      } else if (path === "navigation.position") {
        // A glitched fix never lands in the cache, so the marker and the live
        // track (both drawn from the cache) only ever see good positions.
        if (this.filterVesselPosition(vessel, mmsi, value, timestamp))
          writeDeltaPath(vessel, path, value, timestamp);
      } else {
        writeDeltaPath(vessel, path, value, timestamp);
      }
    }
  }

  // Subscribe to one vessel's own context with a `*` path so its (infrequent)
  // AIS static reports — name, ship type, dimensions — stream in live. SignalK
  // won't deliver `name` through the shared vessels.* subscription and offers no
  // "other vessels" context to target, so each target needs its own `*`
  // subscription. We never subscribe to our own context: `*` there would fire
  // our entire (potentially huge) SignalK tree back at us. Idempotent — the
  // _subscribedMmsis guard keeps repeat sightings from re-sending. A send issued
  // before the socket is open is dropped, but the mmsi stays in the set so the
  // connect handler's resubscribeVessels replays it once connected.
  subscribeVessel(mmsi) {
    const key = String(mmsi);
    if (!key || key == this.ownMmsi || this._subscribedMmsis.has(key))
      return;
    this._subscribedMmsis.add(key);
    this.sendVesselSubscribe(key);
  }

  sendVesselSubscribe(mmsi) {
    this.app.client?.subscribe({
      context: this.contextForMmsi(mmsi),
      subscribe: [{ path: "*", policy: "instant" }],
    });
  }

  // One-shot REST fetch of a newly-sighted vessel's static tree, giving an
  // immediate name/type/dimensions snapshot while the context subscription
  // waits for the vessel's next (often minutes-away) AIS static report. Called
  // exactly once per discovery — the subscription keeps it current afterward.
  // Only static branches are merged so it can't clobber fresher positions that
  // arrived over the delta stream while the request was in flight.
  fetchVesselStatic(context, mmsi) {
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
      .catch(() => { }); // static stays at BoatConfig defaults; not worth surfacing
  }

  // Forget a pruned vessel so resubscribeVessels stops replaying it. The
  // server-side subscription is left hanging: SignalK only accepts the global
  // {context:"*"} unsubscribe form and errors on per-context ones. A silent
  // vessel sends no deltas anyway, and the server drops the subscription with
  // the socket. If it transmits again, vessels.* re-discovers it and
  // subscribeVessel re-subscribes.
  unsubscribeVessel(mmsi) {
    this._subscribedMmsis.delete(String(mmsi));
  }

  // Re-send every per-vessel context subscription. The server forgets our
  // subscriptions when the socket drops, so the connect handler calls this after
  // re-issuing the base subscriptions to restore static streams on reconnect. It
  // also replays anything subscribeVessel queued into _subscribedMmsis before the
  // socket finished opening on the first connect.
  resubscribeVessels() {
    for (const mmsi of this._subscribedMmsis)
      this.sendVesselSubscribe(mmsi);
  }

  // Rebuild an AIS vessel's stream context from its MMSI. Every vessel we track
  // is keyed by MMSI (mmsiFromContext gates out uuid-only contexts), so this
  // round-trips the context string subscribeVessel/unsubscribeVessel need.
  contextForMmsi(mmsi) {
    return `vessels.urn:mrn:imo:mmsi:${mmsi}`;
  }

  // Drop vessels gone silent past the TTL, then reconcile the cache through
  // syncOtherVessels. Its own "absent from the payload" removal then clears
  // markers for both pruned and out-of-radius vessels — no snapshot needed.
  renderFromCache() {
    const now = Date.now();
    for (const mmsi in this.vesselCache) {
      if (now - this.vesselCache[mmsi]._lastSeen > VESSEL_TTL_MS) {
        this.unsubscribeVessel(mmsi);
        delete this.vesselCache[mmsi];
        delete this.glitchFilters[mmsi];
        this.app.statusBar.clear(`glitch-${mmsi}`);
      }
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

  update(state) {
    this.updateOwnPosition(state.getPosition(), state.boatConfig.heading);
    const pos = state.getPosition();
    this.addPointToTrack(this.ownMmsi, pos.lat, pos.lng);
  }

  // Own boat is kept outside the AIS vessels dict so syncOtherVessels never
  // removes it.
  setOwnVessel(coords, boatConfig) {
    this.ownBoatConfig = boatConfig;
    // Prefer a user-uploaded custom icon; if it's missing/broken the marker's
    // own error handler (fallbackIcon) drops back to the ship-type silhouette.
    const customIcon =
      this.app.config && this.app.config.hasCustomIcon
        ? this.app.signalK.boatIconUrl()
        : null;
    this.ownVessel = new L.BoatMarker(coords, {
      beam: boatConfig.beam,
      loa: boatConfig.loa,
      gpsOffset: boatConfig.bowOffset,
      heading: boatConfig.heading,
      icon: customIcon || boatConfig.icon,
      fallbackIcon: boatConfig.icon,
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

  // Swap the own-boat marker image live from the settings dialog. A url (a
  // cache-busted /icon URL) applies a custom icon; null reverts to the
  // ship-type icon derived from the boat config.
  setOwnBoatIcon(url) {
    if (!this.ownVessel)
      return;
    this.ownVessel.setBoatIcon(url || this.ownBoatConfig.icon);
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

      // A history-seeded own track (see seedOwnTrack) is a superset of the
      // tracks plugin's in-memory buffer — don't let the shorter one clobber
      // it. Live appends extend the seeded track either way.
      if (this.isOwnTrack(mmsi) && this.ownTrackSeeded)
        continue;

      const history = data.coordinates?.[0];
      if (!history || !history.length)
        continue;

      // Fresh filter per track: bulk history is glitch-filtered on a synthetic
      // one-second clock (see TRACK_POINT_INTERVAL_MS), independent of the live
      // per-vessel filters, so spikes recorded by the tracks plugin don't get
      // drawn. Runs before the radius filter so the last-good baseline follows
      // the whole track, not just the in-radius part.
      const glitchFilter = new GlitchFilter(this.glitchFilterSpeed);
      const points = [];
      let i = 0;
      let syntheticTime = 0;
      let glitched = 0;
      for (let position of history) {
        const lat = position[1];
        const lon = position[0];
        syntheticTime += TRACK_POINT_INTERVAL_MS;
        if (!glitchFilter.check({ latitude: lat, longitude: lon }, syntheticTime).accepted) {
          glitched++;
          continue;
        }
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
      // One summary line per track — per-point logging would flood the console
      // on a long high-resolution history.
      if (glitched) {
        const label = this.isOwnTrack(mmsi)
          ? "own track"
          : this.vesselCache[mmsi]?.name || `MMSI ${mmsi}`;
        console.warn(
          `Glitch filter: dropped ${glitched} of ${history.length} historical track points for ${label}`,
        );
      }

      if (!points.length)
        continue;
      // A prior load or live deltas may already have drawn a track for this
      // mmsi; drop it before replacing so a re-fetch (e.g. a radius change)
      // doesn't orphan the old layer on the map.
      if (this.vesselTracks[mmsi])
        this.map.removeLayer(this.vesselTracks[mmsi]);
      this.vesselTracks[mmsi] = this.createTrack(points, points.length, mmsi);
      this.trackPointCounts[mmsi] = this.vesselTracks[mmsi].getLatLngs().length;
    }
  }

  // Replace (or create) the own-boat scribble track from positions fetched
  // off the server's History API — used at startup to rehydrate the current
  // anchoring session's track, which the tracks plugin loses on a server
  // restart. Positions are [{latitude, longitude}] oldest first. Applies the
  // same synthetic-clock glitch filtering as the bulk /tracks load — but the
  // clock must advance by the History API sampling interval the caller
  // actually requested, or coarse samples from a long session would be
  // judged at an artificially inflated speed and discarded. No radius
  // filter: an anchor session's track is inherently local. Live deltas keep
  // extending the seeded track through addPointToTrack.
  seedOwnTrack(positions, sampleIntervalMs = TRACK_POINT_INTERVAL_MS) {
    const glitchFilter = new GlitchFilter(this.glitchFilterSpeed);
    const points = [];
    let syntheticTime = 0;
    for (const position of positions) {
      syntheticTime += sampleIntervalMs;
      if (!glitchFilter.check(position, syntheticTime).accepted)
        continue;
      points.push([position.latitude, position.longitude, points.length]);
    }
    if (!points.length)
      return;

    const mmsi = String(this.ownMmsi);
    if (this.vesselTracks[mmsi])
      this.map.removeLayer(this.vesselTracks[mmsi]);
    this.vesselTracks[mmsi] = this.createTrack(points, points.length, mmsi);
    this.trackPointCounts[mmsi] = this.vesselTracks[mmsi].getLatLngs().length;
    this.ownTrackSeeded = true;
    console.log(`Own track rehydrated from history: ${points.length} points`);
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

    // Markers were added, removed, or moved above, so which labels overlap has
    // changed — re-decide independently of any pan/zoom event.
    this.updateLabelCollisions();
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
    // Proximity is the label-collision priority: the closest vessel keeps its
    // name when two would overlap (see updateLabelCollisions).
    marker._labelDistance = distance;

    const config = BoatConfig.extract(vessel);
    // Static data (AIS ship type, dimensions) can land after the marker was
    // first drawn from defaults — a position delta creates the vessel before its
    // static fetch resolves. Re-apply icon + hull geometry so the marker
    // reflects the real type.
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
    marker._labelDistance = distance; // label-collision priority; see updateLabelCollisions
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
    });
    // Only draw it now if its visibility toggle is on; either way it's tracked
    // in this.vesselTracks so applyTrackVisibility can add it back later.
    if (this.trackVisible(mmsi))
      track.addTo(this.map);

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

// Axis-aligned overlap test for two label boxes (viewport-space DOMRects),
// each grown by LABEL_COLLISION_PADDING so kept labels keep a small gap rather
// than merely not touching.
function rectsOverlap(a, b) {
  const gap = LABEL_COLLISION_PADDING;
  return (
    a.left - gap < b.right + gap &&
    a.right + gap > b.left - gap &&
    a.top - gap < b.bottom + gap &&
    a.bottom + gap > b.top - gap
  );
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
