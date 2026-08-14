// AppState is our single source of truth for the current state of the application.

import { SignalKHelper } from "./SignalKHelper.js";
import { BoatConfig } from "./BoatConfig.js";
import { Identity } from "./Identity.js";
import {
  bearing as turfBearing,
  bearingToAzimuth,
  point,
  radiansToDegrees,
} from "@turf/turf";
import { GeoMath } from "./GeoMath.js";
import { watchZoneFromConfig } from "../../shared/watch-zones/index.js";
import { parseScopes, DEFAULT_SCOPES } from "../../shared/scopes.js";
import { GlitchFilter, describeGlitch } from "../../shared/glitch-filter.js";

const DEFAULT_FRESHNESS_SEC = 300;

const DELTA_FAST_SPEED = 250;
const DELTA_SLOW_SPEED = 1000;

// Window after a client-initiated anchor change during which incoming server
// updates for anchor.position/state/zone are ignored. Covers in-flight
// polls whose response was computed before the server processed our request,
// and the brief gap before the matching websocket delta arrives.
export const POST_ACTION_SETTLE_MS = 1000;

export class AppState {
  constructor() {
    this.anchor = {};
    this.tidalRise = 0;
    this.tidalFall = 0;
    // Which scope ratios to compute + display, and the resulting rode lengths.
    // Defaults until setScopeRatios() is called with the plugin config value.
    this.scopeRatios = [...DEFAULT_SCOPES];
    this.scopes = [];
    this._anchorSuppressUntil = { position: 0, state: 0, watchZone: 0 };
    this._lastRadius = 0;
    // Last meta seen per path, from the stream's meta updates (see handleMeta).
    // Grafted onto envelopes that were created from bare value deltas so they
    // can still be formatted with the right display units.
    this._pathMeta = {};
    // Own-position glitch filter (speed configured from the plugin config via
    // setGlitchFilterSpeed). While the latest fix stands rejected,
    // positionGlitch holds { speed } (m/s) for the status bar; a good fix
    // clears it.
    this.glitchFilter = new GlitchFilter();
    this.positionGlitch = null;
    // Who we are to the server and what we may do (see Identity). Replaced once
    // the startup login-status probe resolves; until then the least-privileged
    // identity, so no write control renders before we know it's permitted.
    this.identity = Identity.anonymous();
  }

  setGlitchFilterSpeed(speed) {
    this.glitchFilter.setMaxSpeed(speed);
  }

  websocketSubscribe(client) {
    client.subscribe(
      {
        context: "vessels.self",
        subscribe: [
          {
            path: "navigation.position",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.headingTrue",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.depth.belowKeel",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.depth.belowSurface",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.depth.belowTransducer",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.wind.directionTrue",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.wind.speedApparent",
            period: DELTA_SLOW_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "environment.tide",
            period: 60 * 1000,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.position",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.state",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "navigation.anchor.watchZone",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
          {
            path: "notifications.navigation.anchor",
            period: DELTA_FAST_SPEED,
            format: "full",
            policy: "fixed",
            sendMeta: "all",
          },
        ],
      },
    );
  }

  // Fleet discovery + live state for every *other* vessel, keyed by each
  // message's `context`. One shared vessels.* subscription carries both the
  // dynamic nav paths that place a boat on the map and the static
  // identity/geometry paths BoatConfig renders (name, type, dimensions,
  // antenna offsets). Root attributes (name, mmsi) arrive as empty-path
  // deltas — see FleetLayer.ingestVesselDelta. Requires a server that
  // resolves explicit paths under a wildcard context (unreleased as of this
  // branch); older servers deliver only the navigation.* paths here, so
  // vessels render with default name/geometry.
  websocketSubscribeFleet(client) {
    client.subscribe({
      context: "vessels.*",
      subscribe: [
        { path: "navigation.position", policy: "instant" },
        { path: "navigation.headingTrue", policy: "instant" },
        { path: "navigation.courseOverGroundTrue", policy: "instant" },
        { path: "navigation.speedOverGround", policy: "instant" },
        { path: "name", policy: "instant" },
        { path: "mmsi", policy: "instant" },
        { path: "design.length", policy: "instant" },
        { path: "design.beam", policy: "instant" },
        { path: "design.aisShipType", policy: "instant" },
        { path: "sensors.gps.fromBow", policy: "instant" },
        { path: "sensors.gps.fromCenter", policy: "instant" },
        { path: "sensors.ais.fromBow", policy: "instant" },
        { path: "sensors.ais.fromCenter", policy: "instant" },
      ],
    });
  }

  getPosition() {
    if (this.currentCoordinates)
      return L.latLng(
        this.currentCoordinates.value.latitude,
        this.currentCoordinates.value.longitude,
      );
    else
      return L.latLng(0, 0);
  }

  // Own-vessel heading for display, in degrees — mirrors getPosition() as a
  // read-time accessor with a safe fallback. Unlike computeOwnHeading, each
  // source is gated on freshness so a dead compass feed can't freeze the
  // boat icon:
  // headingTrue > TWA > bearing-to-anchor > 0
  getHeading() {
    if (SignalKHelper.isFresh(this.heading))
      return radiansToDegrees(this.heading.value);

    if (SignalKHelper.isFresh(this.twa))
      return radiansToDegrees(this.twa.value);

    const bearing = this._bearingToAnchor();
    if (bearing !== null)
      return bearing;

    return 0;
  }

  getAnchorPosition() {
    if (this.anchor.position && this.anchor.position.value)
      return L.latLng(
        this.anchor.position.value.latitude,
        this.anchor.position.value.longitude,
      );
    else
      return L.latLng(0, 0);
  }

  isAnchored() {
    return this.anchor?.state?.value === "on";
  }

  // Pull one path's envelope out of a snapshot tree, merged against the
  // envelope we already hold. The websocket opens before the /vessels/self
  // snapshot resolves, so deltas may already carry a fresher value than the
  // snapshot — the newer envelope wins (see _newest), and a missing or stale
  // snapshot value keeps the current one.
  extract(tree, path, current, fresh = true, maxAge = DEFAULT_FRESHNESS_SEC) {
    let data = SignalKHelper.extract(tree, path);

    if (!data)
      return current ?? null;

    // check for freshness.
    if (fresh && !SignalKHelper.isFresh(data, maxAge)) {
      const ageSec = data.timestamp
        ? Math.round((Date.now() - new Date(data.timestamp).getTime()) / 1000)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKHelper.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      // The snapshot value is too old to trust, but its meta (units,
      // displayUnits) is not time-sensitive — graft it so an envelope the
      // delta stream built from bare values can still be formatted.
      if (current && !current.meta && data.meta)
        current.meta = data.meta;
      return current ?? null;
    }

    return this._newest(data, current);
  }

  // Keep whichever envelope is newer so the snapshot can't roll a live value
  // backwards. When the delta envelope wins but arrived without meta, graft
  // the snapshot's meta on so displayUnits still land.
  _newest(extracted, current) {
    if (!current?.timestamp || !extracted.timestamp)
      return extracted;
    if (Date.parse(extracted.timestamp) >= Date.parse(current.timestamp))
      return extracted;
    if (extracted.meta && !current.meta)
      current.meta = extracted.meta;
    return current;
  }

  extractAll(data) {
    this.boatConfig = BoatConfig.extract(data);

    const position = this.extract(data, "navigation.position", this.currentCoordinates);
    // Seed the glitch filter with the snapshot fix so the first live delta is
    // judged against it rather than accepted blind. Skipped when the delta
    // stream already beat the snapshot — the filter's baseline is fresher.
    if (position?.value && position !== this.currentCoordinates) {
      const seedTime = Date.parse(position.timestamp);
      this.glitchFilter.check(
        position.value,
        Number.isFinite(seedTime) ? seedTime : Date.now(),
      );
    }
    this.currentCoordinates = position;
    this.heading = this.extract(data, "navigation.headingTrue", this.heading);
    this.belowKeel = this.extract(data, "environment.depth.belowKeel", this.belowKeel);
    this.belowSurface = this.extract(data, "environment.depth.belowSurface", this.belowSurface);
    this.belowTransducer = this.extract(data, "environment.depth.belowTransducer", this.belowTransducer);
    this.twa = this.extract(data, "environment.wind.directionTrue", this.twa);
    this.aws = this.extract(data, "environment.wind.speedApparent", this.aws);
    // The tide subtree is replaced wholesale when present — it's a tree of
    // per-field envelopes with no timestamp of its own, so _newest always
    // picks it. Tide moves hourly; a snapshot a few seconds behind the delta
    // stream is harmless.
    this.tide = this.extract(data, "environment.tide", this.tide, false);

    if (!this.anchor)
      this.anchor = {};

    if (!this._anchorSuppressed("state"))
      this.anchor.state = this.extract(data, "navigation.anchor.state", this.anchor.state, false);

    // anchor.position is treated as a UI preference: the server clears it on raise,
    // but the toolbar/overlay want to keep the last set value so the next
    // drop has a sensible default.
    if (!this._anchorSuppressed("position")) {
      let newAnchorPosition =
        this.extract(data, "navigation.anchor.position", this.anchor.position, false);
      if (newAnchorPosition && newAnchorPosition.value == null && this.anchor.position?.value)
        newAnchorPosition.value = this.anchor.position.value;
      this.anchor.position = newAnchorPosition;
    }

    // anchor.watchZone is treated as a UI preference: the server clears it on raise,
    // but the toolbar/overlay want to keep the last set value so the next
    // drop has a sensible default.
    if (!this._anchorSuppressed("watchZone")) {
      let newWatchZone =
        this.extract(data, "navigation.anchor.watchZone", this.anchor.watchZone, false);
      //keep our old one if we have it.
      if (newWatchZone && newWatchZone.value == null && this.anchor.watchZone?.value)
        newWatchZone.value = this.anchor.watchZone.value;
      this.anchor.watchZone = newWatchZone;
    }

    this.anchor.notification =
      this.extract(data, "notifications.navigation.anchor", this.anchor.notification, false);
  }

  handleDelta(timestamp, delta) {
    const path = delta.path;

    // Mutate the existing envelope so meta/$source/pgn/values populated by
    // extractAll survive delta updates. Only create a new envelope the first
    // time we see a path, grafting on any meta the stream already delivered
    // (see handleMeta) so it can be formatted from birth.
    const apply = (current) => {
      if (current) {
        current.value = delta.value;
        current.timestamp = timestamp;
        if (delta.meta)
          current.meta = delta.meta;
        else if (!current.meta && this._pathMeta[path])
          current.meta = this._pathMeta[path];
        return current;
      }
      const envelope = { value: delta.value, timestamp };
      const meta = delta.meta ?? this._pathMeta[path];
      if (meta)
        envelope.meta = meta;
      return envelope;
    };

    if (path == "navigation.position") {
      // Glitch filter: reject fixes implying an impossible speed so a GPS jump
      // doesn't move the boat, pollute the track, or skew any derived reading.
      // The rejection is surfaced via positionGlitch (see StatusBar.update)
      // and cleared by the next good fix.
      const time = Date.parse(timestamp);
      const result = this.glitchFilter.check(
        delta.value,
        Number.isFinite(time) ? time : Date.now(),
      );
      if (result.accepted) {
        if (result.limitAccepted)
          console.warn(
            `Glitch filter: run limit reached — accepting own fix at ${result.speed.toFixed(1)} m/s as real movement`,
          );
        this.positionGlitch = null;
        this.currentCoordinates = apply(this.currentCoordinates);
      } else {
        this.positionGlitch = { speed: result.speed };
        console.warn(
          `Glitch filter: rejected own fix ${describeGlitch(this.glitchFilter, result, delta.value)}`,
        );
      }
    }
    else if (path == "navigation.headingTrue")
      this.heading = apply(this.heading);
    else if (path == "environment.depth.belowKeel")
      this.belowKeel = apply(this.belowKeel);
    else if (path == "environment.depth.belowSurface")
      this.belowSurface = apply(this.belowSurface);
    else if (path == "environment.depth.belowTransducer")
      this.belowTransducer = apply(this.belowTransducer);
    else if (path == "environment.wind.directionTrue")
      this.twa = apply(this.twa);
    else if (path == "environment.wind.speedApparent")
      this.aws = apply(this.aws);
    else if (path == "environment.tide.heightHigh")
      (this.tide ??= {}).heightHigh = apply(this.tide.heightHigh);
    else if (path == "environment.tide.heightLow")
      (this.tide ??= {}).heightLow = apply(this.tide.heightLow);
    else if (path == "environment.tide.heightNow")
      (this.tide ??= {}).heightNow = apply(this.tide.heightNow);
    else if (path == "environment.tide.stationName")
      (this.tide ??= {}).stationName = apply(this.tide.stationName);
    else if (path == "environment.tide.timeHigh")
      (this.tide ??= {}).timeHigh = apply(this.tide.timeHigh);
    else if (path == "environment.tide.timeLow")
      (this.tide ??= {}).timeLow = apply(this.tide.timeLow);
    else if (path == "navigation.anchor.state") {
      if (!this._anchorSuppressed("state"))
        this.anchor.state = apply(this.anchor.state);
    }
    else if (path == "navigation.anchor.position") {
      if (delta.value != null && !this._anchorSuppressed("position"))
        this.anchor.position = apply(this.anchor.position);
    }
    else if (path == "navigation.anchor.watchZone") {
      if (delta.value != null && !this._anchorSuppressed("watchZone"))
        this.anchor.watchZone = apply(this.anchor.watchZone);
    }
    else if (path == "notifications.navigation.anchor")
      this.anchor.notification = apply(this.anchor.notification);
    // else if (!path.startsWith("notifications"))
    //   console.log(`[websocket] Ignoring: ${path}`);
  }

  // Meta arrives on the stream in its own updates (an `updates[].meta` array,
  // no `values`) — once per path per connection, because SignalKStream opens
  // the socket with sendMeta=all. Without this, an envelope created purely
  // from deltas (its source was offline when the /vessels/self snapshot
  // loaded, or the snapshot value was dropped as stale) never gets
  // meta.displayUnits, DisplayUnit.formatDelta returns "", and the panel
  // fields render blank.
  // Stash each path's meta for envelopes yet to be born (see apply in
  // handleDelta) and refresh any envelope we already hold so a units-
  // preference change propagates without waiting for the next value delta.
  handleMeta(path, meta) {
    if (!path || !meta)
      return;
    this._pathMeta[path] = meta;
    const envelope = this._envelopeFor(path);
    if (envelope)
      envelope.meta = meta;
  }

  // The live envelope currently holding a path's value, or null for paths we
  // don't track (or haven't seen yet). Mirrors handleDelta's routing.
  _envelopeFor(path) {
    switch (path) {
      case "navigation.position":
        return this.currentCoordinates;
      case "navigation.headingTrue":
        return this.heading;
      case "environment.depth.belowKeel":
        return this.belowKeel;
      case "environment.depth.belowSurface":
        return this.belowSurface;
      case "environment.depth.belowTransducer":
        return this.belowTransducer;
      case "environment.wind.directionTrue":
        return this.twa;
      case "environment.wind.speedApparent":
        return this.aws;
      case "environment.tide.heightHigh":
        return this.tide?.heightHigh;
      case "environment.tide.heightLow":
        return this.tide?.heightLow;
      case "environment.tide.heightNow":
        return this.tide?.heightNow;
      default:
        return null;
    }
  }

  // Client-initiated optimistic write into the anchor envelopes.
  // Per-key suppression is bumped only for the paths we actually touch.
  // That keeps us from blocking incoming position/state deltas from another client.
  // Only the keys present in `updates` are touched; pass `null` to clear a field.
  applyClientAnchorState(updates = {}) {
    const timestamp = new Date().toISOString();
    const expireAt = Date.now() + POST_ACTION_SETTLE_MS;

    const set = (key, value) => {
      this._anchorSuppressUntil[key] = expireAt;
      if (this.anchor[key]) {
        this.anchor[key].value = value;
        this.anchor[key].timestamp = timestamp;
      } else {
        this.anchor[key] = { value, timestamp };
      }
    };

    if ("position" in updates)
      set("position", updates.position);
    if ("state" in updates)
      set("state", updates.state);
    if ("watchZone" in updates)
      set("watchZone", updates.watchZone);
  }

  // Capture the current anchor envelopes so a failed client action can roll
  // back. Deep-cloned so subsequent in-place mutations (applyClientAnchorState,
  // cleanDisplayUnits) don't corrupt the snapshot.
  //
  // Cloned via JSON round-trip rather than structuredClone(): the latter only
  // landed in Chrome 98 and is absent on the Navico MFD engine (Chromium 69),
  // where it threw here — before the drop/raise POST was sent — and silently
  // killed both actions. Transpilation can't help; it's a missing runtime
  // global, not syntax. The envelopes are plain JSON (ISO-string timestamps,
  // primitive/object values, no Dates/Maps/functions/cycles), so this is a
  // faithful clone.
  snapshotAnchorState() {
    return JSON.parse(
      JSON.stringify({
        position: this.anchor.position ?? null,
        state: this.anchor.state ?? null,
        watchZone: this.anchor.watchZone ?? null,
      }),
    );
  }

  // Restore from a snapshot and release the suppression window so the next
  // server update can land immediately.
  restoreAnchorState(snapshot) {
    this.anchor.position = snapshot.position;
    this.anchor.state = snapshot.state;
    this.anchor.watchZone = snapshot.watchZone;
    this._anchorSuppressUntil = { position: 0, state: 0, watchZone: 0 };
  }

  // Build a WatchZone instance from current state. Used by the overlay/controls
  // factory and by AnchorController when posting drop/setZone. Falls back to a
  // default circle when the server hasn't published a zone yet (e.g., first
  // load with anchor up) so the UI always has a shape to draw.
  getWatchZone() {
    const config = this.anchor.watchZone?.value;
    if (config && typeof config === "object")
      return watchZoneFromConfig(config);
    return watchZoneFromConfig({ type: "circle", radius: 60 });
  }

  _anchorSuppressed(key) {
    return Date.now() < this._anchorSuppressUntil[key];
  }

  calculate() {
    this.cleanDisplayUnits();
    this.calculateTides();
    if (this.boatConfig)
      this.boatConfig.heading = this.computeOwnHeading();
    this.calculateScopes();
  }

  // SignalK's units-preferences plugin is sometimes buggy for me.
  // this is a workaround since we know these parameters should
  // always have these categories. It also guarantees these envelopes can
  // always be formatted: when meta never arrived at all (a delta-built
  // envelope on a server that sent none), the displayUnits scaffolding is
  // created here so DisplayUnit.formatDelta doesn't return "" and blank the
  // panel fields.
  cleanDisplayUnits() {
    const ensureDepth = (envelope) => {
      if (!envelope)
        return;
      if (!envelope.meta)
        envelope.meta = {};
      if (!envelope.meta.displayUnits)
        envelope.meta.displayUnits = {};
      const du = envelope.meta.displayUnits;
      if (!du.category || du.category === "distance")
        du.category = "depth";
    };
    ensureDepth(this.belowSurface);
    ensureDepth(this.belowKeel);
    ensureDepth(this.belowTransducer);
    ensureDepth(this.tide?.heightLow);
    ensureDepth(this.tide?.heightHigh);
    ensureDepth(this.tide?.heightNow);
  }

  calculateTides() {
    if (
      !this.tide ||
      !this.tide.timeLow ||
      !this.tide.heightLow ||
      !this.tide.timeHigh ||
      !this.tide.heightHigh
    )
      return;

    this.currentTide = GeoMath.estimateTideHeightSmooth(
      this.tide.timeLow.value,
      this.tide.heightLow.value,
      this.tide.timeHigh.value,
      this.tide.heightHigh.value,
    );

    this.tidalRise = this.tide.heightHigh.value - this.currentTide;
    this.tidalFall = this.currentTide - this.tide.heightLow.value;
  }

  // Set which scope ratios to calculate from a user-supplied value (the
  // plugin's comma-separated `scopes` config, or an array). Fault tolerant:
  // invalid/out-of-range entries are dropped and the defaults are used if
  // nothing usable remains. See shared/scopes.js.
  setScopeRatios(input) {
    this.scopeRatios = parseScopes(input);
  }

  // Produce one {ratio, length} entry per configured ratio, highest→lowest.
  calculateScopes() {
    this.scopes = this.scopeRatios.map((ratio) => ({
      ratio,
      length: this.calculateScope(ratio),
    }));
  }

  calculateScope(scope) {
    // A null value is a real occurrence (a sounder that lost bottom lock
    // publishes value:null) — without the finite check it would coerce to 0
    // and yield a confidently wrong rode length instead of no length.
    if (!Number.isFinite(this.belowSurface?.value) || !this.boatConfig)
      return 0;
    let maxHeight = this.belowSurface.value;
    maxHeight += this.boatConfig.anchorRollerHeight; // height of the bow roller
    maxHeight += this.tidalRise; // delta to high tide
    return maxHeight * scope;
  }

  getAnchorEstimate() {
    const boatConfig = this.boatConfig;
    // Cap the estimate at the chain we actually carry — the anchor can't be
    // further from the bow than our rode.
    const distance = Math.min(
      this.calculateScope(5),
      boatConfig.totalAnchorChainLength,
    );

    let radius = distance + boatConfig.loa * 2;
    radius = Math.round(radius / 5) * 5;
    radius = Math.max(0, radius);
    radius = Math.min(200, radius);

    return { distance, radius };
  }

  getDefaultRadius() {
    // Read the circle-equivalent radius of whatever shape is active. A polygon
    // has no `radius` field — its size lives in the vertex distances — so going
    // through getCircleRadius() lets a resized polygon carry its size over when
    // the user switches to another shape.
    const config = this.anchor?.watchZone?.value;
    const currentRadius =
      config && typeof config === "object"
        ? Number(watchZoneFromConfig(config).getCircleRadius())
        : NaN;
    const estimatedRadius = Number(this.getAnchorEstimate()?.radius);

    let radius = 60;

    if (Number.isFinite(currentRadius) && currentRadius > 0)
      radius = currentRadius;
    else if (Number.isFinite(this._lastRadius) && this._lastRadius > 0)
      radius = this._lastRadius;
    else if (Number.isFinite(estimatedRadius) && estimatedRadius > 0)
      radius = estimatedRadius;

    this._lastRadius = radius;

    return radius;
  }

  // Heading priority:
  // SignalK headingTrue
  // bearing-to-anchor (if dropped)
  // last-known TWA
  // 0
  computeOwnHeading() {
    if (this.heading)
      return radiansToDegrees(this.heading.value);

    const bearing = this._bearingToAnchor();
    if (bearing !== null)
      return bearing;

    if (this.twa)
      return radiansToDegrees(this.twa.value);

    return 0;
  }

  // Degrees from our GPS position to the anchor, or null when either end is
  // unknown.
  _bearingToAnchor() {
    if (!this.anchor.position?.value || !this.currentCoordinates)
      return null;
    return Math.round(
      bearingToAzimuth(
        turfBearing(
          point([
            this.currentCoordinates.value.longitude,
            this.currentCoordinates.value.latitude,
          ]),
          point([
            this.anchor.position.value.longitude,
            this.anchor.position.value.latitude,
          ]),
        ),
      ),
    );
  }
}
