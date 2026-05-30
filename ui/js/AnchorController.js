// AnchorController turns user actions (drop / raise / set zone / estimate)
// into optimistic writes against AppState plus a backing POST to SignalK. All
// visible state lives in AppState; AnchorAlarm.updateMap fans that out to the
// overlay and HUD panels. After each optimistic write we call onChange() so
// the UI reflects the new state without waiting for the next poll tick. On a
// POST failure we restore from the pre-write snapshot.

import { destination, point } from "@turf/turf";
import { GeoMath } from "./GeoMath.js";
import { createDefaultZoneConfig } from "./hud/zones/index.js";
import { watchZoneFromConfig } from "../../shared/watch-zones/index.js";

export class AnchorController {
  constructor({ appState, overlay, signalK, statusBar, defaultShape, onChange }) {
    this._appState = appState;
    this._overlay = overlay;
    this._signalK = signalK;
    this._statusBar = statusBar;
    this._defaultShape = defaultShape || "circle";
    this._onChange = onChange;

    this._pending = false;
  }

  // === User-initiated transitions =================================================

  requestDrop() {
    if (this._appState.isAnchored() || this._pending)
      return;

    const pos = this._overlay.getCrosshairPosition();
    if (!pos)
      return;

    const zoneConfig = this._currentZoneConfig();
    if (!zoneConfig)
      return;

    const anchorPos = { latitude: pos.lat, longitude: pos.lng };
    const snapshot = this._appState.snapshotAnchorState();
    this._pending = true;
    this._appState.applyClientAnchorState({
      position: anchorPos,
      watchZone: zoneConfig,
      state: "on",
    });

    // Refuse a drop that leaves the boat outside the zone — it would trip the
    // drag alarm on the very first tick. Check after the optimistic write (so
    // the zone is in place) but before the backend POST; the backend re-checks
    // authoritatively.
    if (!this._currentPositionInZone(zoneConfig, anchorPos)) {
      this._appState.restoreAnchorState(snapshot);
      this._statusBar.logError("Boat is outside the watch zone.");
      this._onChange();
      this._pending = false;
      return;
    }

    this._onChange();

    this._signalK
      .dropAnchor(anchorPos, zoneConfig)
      .then(() => {
        this._statusBar.clear("anchor-drop");
      })
      .catch((err) => {
        this._appState.restoreAnchorState(snapshot);
        const detail = err?.statusText || err?.message || "unknown error";
        this._statusBar.set("anchor-drop", `Failed to drop anchor: ${detail}`, "error");
        this._onChange();
      })
      .finally(() => {
        this._pending = false;
      });
  }

  requestRaise() {
    if (!this._appState.isAnchored() || this._pending)
      return;

    const snapshot = this._appState.snapshotAnchorState();
    this._pending = true;
    // Intentionally not clearing watchZone — preserved for UI
    // continuity so the toolbar and overlay keep the last set values and the
    // next drop has sensible defaults. AppState also filters server nulls.
    this._appState.applyClientAnchorState({
      position: null,
      state: "off",
    });
    this._onChange();

    this._signalK
      .raiseAnchor()
      .then(() => {
        this._statusBar.clear("anchor-raise");
      })
      .catch((err) => {
        this._appState.restoreAnchorState(snapshot);
        const detail = err?.statusText || err?.message || "unknown error";
        this._statusBar.set("anchor-raise", `Failed to raise anchor: ${detail}`, "error");
        this._onChange();
      })
      .finally(() => {
        this._pending = false;
      });
  }

  // Live-preview zone edit during a zone edit. Optimistic write only — no backend
  // POST — and the per-tick call refreshes the watchZone suppression window
  // (POST_ACTION_SETTLE_MS) so a slow drag isn't clobbered by an incoming
  // server delta. setZone() is the commit path on drag-end.
  previewZone(zoneConfig) {
    if (this._pending)
      return;
    if (!zoneConfig || typeof zoneConfig !== "object" || !zoneConfig.type)
      return;
    this._appState.applyClientAnchorState({ watchZone: zoneConfig });
    this._onChange();
  }

  // Zone changes don't take _pending themselves: the +/- buttons should feel
  // responsive even if a previous setZone is still posting, and the
  // suppression window keeps stale server responses from clobbering us. They
  // do bail while a drop/raise is in flight to avoid a tangled rollback.
  setZone(zoneConfig) {
    if (this._pending)
      return;
    if (!zoneConfig || typeof zoneConfig !== "object" || !zoneConfig.type)
      return;

    const snapshot = this._appState.snapshotAnchorState();
    this._appState.applyClientAnchorState({ watchZone: zoneConfig });

    // When anchored, refuse a zone that no longer contains the boat — saving it
    // would trip the drag alarm immediately. Check after the optimistic write
    // but before the backend POST. (Not anchored → no alarm, nothing to guard.)
    if (
      this._appState.isAnchored() &&
      !this._currentPositionInZone(zoneConfig, this._appState.anchor?.position?.value)
    ) {
      this._appState.restoreAnchorState(snapshot);
      this._statusBar.logError("Boat is outside the watch zone.");
      this._onChange();
      return;
    }

    this._onChange();

    if (!this._appState.isAnchored())
      return;

    this._signalK
      .setZone(zoneConfig)
      .then(() => this._statusBar.clear("anchor-zone"))
      .catch((err) => {
        const detail = err?.statusText || err?.message || "unknown error";
        this._statusBar.set("anchor-zone", `Failed to set zone: ${detail}`, "error");
      });
  }

  // === Helpers ====================================================================

  // True when the vessel's current GPS fix lies inside `zoneConfig` anchored at
  // `anchorPos` ({ latitude, longitude }). Used to refuse a drop / zone change
  // that would immediately trip the drag alarm. Returns true when we can't
  // prove otherwise (no fix, unknown anchor, or a malformed config) so missing
  // data never blocks the action — the backend re-checks authoritatively.
  _currentPositionInZone(zoneConfig, anchorPos) {
    const current = this._appState.currentCoordinates?.value;
    if (!current || current.latitude == null || current.longitude == null)
      return true;
    if (!anchorPos || anchorPos.latitude == null || anchorPos.longitude == null)
      return true;

    let zone;
    try {
      zone = watchZoneFromConfig(zoneConfig);
    } catch {
      return true;
    }

    return zone.contains(
      { latitude: current.latitude, longitude: current.longitude },
      { latitude: anchorPos.latitude, longitude: anchorPos.longitude },
    );
  }

  // Pull the current zone config from AppState.
  _currentZoneConfig() {
    const config = this._appState.anchor?.watchZone?.value;
    if (config && typeof config === "object" && config.type)
      return config;
    return null;
  }

  estimateAnchorPosition() {
    if (!this._appState.currentCoordinates)
      return;
    if (this._appState.isAnchored() || this._pending)
      return;

    const boatConfig = this._appState.boatConfig;
    const { distance } = this._appState.getAnchorEstimate();

    this._appState.applyClientAnchorState({
      watchZone: createDefaultZoneConfig(this._defaultShape, this._appState),
    });

    const bow = GeoMath.calculateBowCoordinates(
      this._appState.getPosition(),
      boatConfig.heading,
      boatConfig.gpsBowXDistance,
      boatConfig.gpsBowYDistance,
    );
    const guess = destination(
      point([bow.lng, bow.lat]),
      distance,
      boatConfig.heading,
      { units: "meters" },
    );
    const [guessLon, guessLat] = guess.geometry.coordinates;
    this._overlay.setCrosshairPosition(L.latLng(guessLat, guessLon));
    this._onChange();
  }
}
