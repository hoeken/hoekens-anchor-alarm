// AnchorController owns the anchor state machine and the {state,
// anchorCoordinates, maxRadius} triple. It drives AnchorOverlay, ControlToolbar,
// and the Info/Scope HUD panels so the host (AnchorAlarm) doesn't have to flip
// state in five different places. Two flows feed it:
//
//   - User-initiated (requestDrop/requestRaise): goes through DROPPING/RAISING,
//     posts to SignalK, lands in ANCHORED/UP on completion. The transient state
//     acts as the in-flight gate that suppresses reconcile(); a short post-action
//     settle window then guards against stale poll/delta data that was generated
//     before the server processed our request.
//   - Server-initiated (reconcile): transitions UP↔ANCHORED directly, no POST,
//     ignored entirely while a user request is in flight.

import { GeoMath } from "./GeoMath.js";

export const AnchorState = Object.freeze({
  UP: "UP",
  DROPPING: "DROPPING",
  ANCHORED: "ANCHORED",
  RAISING: "RAISING",
});

// Window after a successful drop/raise during which we ignore a reconcile that
// contradicts our just-set local state. Covers in-flight polls whose response
// was computed before the server processed our POST, and the brief gap before
// the matching websocket delta arrives.
const POST_ACTION_SETTLE_MS = 3000;

export class AnchorController {
  constructor({
    appState,
    overlay,
    toolbar,
    signalK,
    infoPanel,
    scopePanel,
    statusBar,
  }) {
    this._appState = appState;
    this._overlay = overlay;
    this._toolbar = toolbar;
    this._signalK = signalK;
    this._infoPanel = infoPanel;
    this._scopePanel = scopePanel;
    this._statusBar = statusBar;

    this.state = AnchorState.UP;
    this.anchorCoordinates = null;
    this.maxRadius = 0;
    this._lastUserActionAt = 0;

    this.reconcile();
  }

  // === User-initiated transitions =================================================

  requestDrop() {
    if (this.state !== AnchorState.UP)
      return;
    const pos = this._overlay.getCrosshairPosition();
    if (!pos)
      return;

    this.state = AnchorState.DROPPING;
    this._enterDropped(pos, this.maxRadius);
    this._signalK
      .dropAnchor({ latitude: pos.lat, longitude: pos.lng }, this.maxRadius)
      .then(() => {
        this.state = AnchorState.ANCHORED;
        this._writeLocalAnchor(pos, this.maxRadius);
        this._lastUserActionAt = Date.now();
        this._toolbar.setState(this.state);
        this._statusBar.clear("anchor-drop");
      })
      .catch((err) => {
        // Roll back to UP so the user sees the actual server state instead of
        // a green "anchored" UI that doesn't match reality.
        this.state = AnchorState.UP;
        this._enterRaised();
        const detail = err?.statusText || err?.message || "unknown error";
        this._statusBar.set("anchor-drop", `Failed to drop anchor: ${detail}`, "error");
      });
  }

  requestRaise() {
    if (this.state !== AnchorState.ANCHORED)
      return;

    const previousAnchor = this.anchorCoordinates;
    const previousRadius = this.maxRadius;

    this.state = AnchorState.RAISING;
    this._enterRaised();
    this._signalK
      .raiseAnchor()
      .then(() => {
        this.state = AnchorState.UP;
        this._clearLocalAnchor();
        this._lastUserActionAt = Date.now();
        this._toolbar.setState(this.state);
        this._statusBar.clear("anchor-raise");
      })
      .catch((err) => {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(previousAnchor, previousRadius);
        const detail = err?.statusText || err?.message || "unknown error";
        this._statusBar.set("anchor-raise", `Failed to raise anchor: ${detail}`, "error");
      });
  }

  setRadius(newRadius) {
    this.maxRadius = newRadius;
    if (!this._appState.anchor.maxRadius)
      this._appState.anchor.maxRadius = { value: newRadius };
    else
      this._appState.anchor.maxRadius.value = newRadius;
    this._toolbar.setRadius(newRadius);
    this._overlay.setRadius(newRadius);

    if (this.state === AnchorState.ANCHORED) {
      this._signalK
        .setRadius(newRadius)
        .then(() => this._statusBar.clear("anchor-radius"))
        .catch((err) => {
          const detail = err?.statusText || err?.message || "unknown error";
          this._statusBar.set("anchor-radius", `Failed to set radius: ${detail}`, "error");
        });
    }
  }

  // === helpers ==================================================================

  estimateAnchorPosition() {
    if (!this._appState.currentCoordinates)
      return;
    if (this.state !== AnchorState.UP)
      return;

    const distance = this._appState.calculateScope(5);
    this.setRadius(
      this.computeDefaultRadius(
        distance,
        this._appState.boatConfig.gpsBowXDistance,
        this._appState.boatConfig.gpsBowYDistance,
      ),
    );
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
    this.restoreRaised(L.latLng(guess.latitude, guess.longitude));
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

  // === Server-initiated ===========================================================

  // Apply server-side anchor state. Skipped while a drop/raise POST is in flight —
  // the server doesn't reflect our pending change yet and would flip us back.
  // Also ignores transitions that contradict our local state for a short window
  // after a successful user action, to shield against in-flight stale data.
  reconcile() {
    if (this.state !== AnchorState.UP && this.state !== AnchorState.ANCHORED)
      return;

    const serverAnchored = !!(
      this._appState.anchor.position && this._appState.anchor.position.value
    );
    const localAnchored = this.state === AnchorState.ANCHORED;

    if (
      serverAnchored !== localAnchored &&
      Date.now() - this._lastUserActionAt < POST_ACTION_SETTLE_MS
    )
      return;

    if (serverAnchored) {
      this.anchorCoordinates = this._appState.getAnchorPosition();
      this.maxRadius =
        this._appState.anchor.maxRadius?.value ?? this.maxRadius;
      if (this.state === AnchorState.UP) {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(this.anchorCoordinates, this.maxRadius);
      } else {
        this._toolbar.setRadius(this.maxRadius);
        this._overlay.setRadius(this.maxRadius);
      }
    } else if (this.state === AnchorState.ANCHORED) {
      this.state = AnchorState.UP;
      this._enterRaised();
    }
  }

  // === Restore (called from the "home" re-estimate) ===============================

  restoreRaised(guessPosition) {
    this.anchorCoordinates = guessPosition;
    this._enterRaised();
  }

  // === Crosshair drag (overlay-driven while raised) ===============================

  updateCrosshairPosition(pos) {
    if (this.state === AnchorState.ANCHORED)
      return;
    this.anchorCoordinates = pos;
  }

  // === internals ==================================================================

  // After a successful user action, mirror the change into AppState so reconcile
  // sees a consistent view until the matching server delta/poll lands. Without
  // this, an in-flight stale response can reach extractAll first and flip us back.
  _writeLocalAnchor(position, radius) {
    const timestamp = new Date().toISOString();
    const value = { latitude: position.lat, longitude: position.lng };
    if (this._appState.anchor.position) {
      this._appState.anchor.position.value = value;
      this._appState.anchor.position.timestamp = timestamp;
    } else {
      this._appState.anchor.position = { value, timestamp };
    }
    if (this._appState.anchor.maxRadius) {
      this._appState.anchor.maxRadius.value = radius;
      this._appState.anchor.maxRadius.timestamp = timestamp;
    } else {
      this._appState.anchor.maxRadius = { value: radius, timestamp };
    }
  }

  _clearLocalAnchor() {
    const timestamp = new Date().toISOString();
    if (this._appState.anchor.position) {
      this._appState.anchor.position.value = null;
      this._appState.anchor.position.timestamp = timestamp;
    }
    if (this._appState.anchor.maxRadius) {
      this._appState.anchor.maxRadius.value = null;
      this._appState.anchor.maxRadius.timestamp = timestamp;
    }
  }

  _enterDropped(position, radius) {
    this.anchorCoordinates = position;

    this.maxRadius = parseInt(radius, 10);
    if (!(this.maxRadius > 0))
      this.maxRadius = 20;

    this._toolbar.setState(this.state);
    this._toolbar.setRadius(this.maxRadius);
    this._scopePanel.hide();
    this._infoPanel.show();
    this._overlay.drop(position, this.maxRadius);
  }

  _enterRaised() {
    this._toolbar.setState(this.state);
    this._infoPanel.hide();
    this._scopePanel.show();
    this._overlay.raise(this.anchorCoordinates);
  }
}
