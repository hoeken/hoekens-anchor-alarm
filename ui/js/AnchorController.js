// AnchorController turns user actions (drop / raise / set zone / estimate)
// into optimistic writes against AppState plus a backing POST to SignalK. All
// visible state lives in AppState; AnchorAlarm.updateMap fans that out to the
// overlay and HUD panels. After each optimistic write we call onChange() so
// the UI reflects the new state without waiting for the next poll tick. On a
// POST failure we restore from the pre-write snapshot.

import { GeoMath } from "./GeoMath.js";

export class AnchorController {
  constructor({ appState, overlay, signalK, statusBar, onChange }) {
    this._appState = appState;
    this._overlay = overlay;
    this._signalK = signalK;
    this._statusBar = statusBar;
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

    const snapshot = this._appState.snapshotAnchorState();
    this._pending = true;
    this._appState.applyClientAnchorState({
      position: { latitude: pos.lat, longitude: pos.lng },
      watchZone: zoneConfig,
      state: "on",
    });
    this._onChange();

    this._signalK
      .dropAnchor({ latitude: pos.lat, longitude: pos.lng }, zoneConfig)
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

  // Zone changes don't take _pending themselves: the +/- buttons should feel
  // responsive even if a previous setZone is still posting, and the
  // suppression window keeps stale server responses from clobbering us. They
  // do bail while a drop/raise is in flight to avoid a tangled rollback.
  setZone(zoneConfig) {
    if (this._pending)
      return;
    if (!zoneConfig || typeof zoneConfig !== "object" || !zoneConfig.type)
      return;

    const updates = { watchZone: zoneConfig };
    this._appState.applyClientAnchorState(updates);
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

    const distance = this._appState.calculateScope(5);
    const radius = this.computeDefaultRadius(
      distance,
      this._appState.boatConfig.gpsBowXDistance,
      this._appState.boatConfig.gpsBowYDistance,
    );
    this._appState.applyClientAnchorState({
      watchZone: { type: "circle", radius },
    });

    const bow = GeoMath.calculateBowCoordinates(
      this._appState.getPosition(),
      this._appState.boatConfig.heading,
      this._appState.boatConfig.gpsBowXDistance,
      this._appState.boatConfig.gpsBowYDistance,
    );
    const guess = GeoMath.calculateDestinationPoint(
      bow.lat,
      bow.lng,
      this._appState.boatConfig.heading,
      distance,
    );
    this._overlay.setCrosshairPosition(L.latLng(guess.latitude, guess.longitude));
    this._onChange();
  }

  // Default radius = 5:1 scope + GPS-to-bow vector, ×1.5 safety, rounded to a
  // 5-meter step and clamped to [0, 200].
  computeDefaultRadius(anchorDistanceGuess, xOffset, yOffset) {
    let r = anchorDistanceGuess;
    r += GeoMath.calculateVectorDistance(xOffset, yOffset);
    r *= 1.5;
    r = Math.round(r / 5) * 5;
    r = Math.max(0, r);
    r = Math.min(200, r);
    return r;
  }
}
