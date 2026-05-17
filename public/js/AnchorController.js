// AnchorController owns the anchor state machine and the {state,
// anchorCoordinates, maxRadius} triple. It drives AnchorOverlay, ControlToolbar,
// and the Info/Scope HUD panels so the host (AnchorAlarm) doesn't have to flip
// state in five different places. Two flows feed it:
//
//   - User-initiated (requestDrop/requestRaise): goes through DROPPING/RAISING,
//     posts to SignalK, lands in ANCHORED/UP on completion. The transient state
//     also acts as the in-flight gate that suppresses reconcile().
//   - Server-initiated (reconcile): transitions UP↔ANCHORED directly, no POST,
//     ignored entirely while a user request is in flight.

const AnchorState = Object.freeze({
  UP: 'UP',
  DROPPING: 'DROPPING',
  ANCHORED: 'ANCHORED',
  RAISING: 'RAISING',
});

class AnchorController {

  constructor({ overlay, toolbar, signalK, infoPanel, scopePanel, initialRadius }) {
    this._overlay = overlay;
    this._toolbar = toolbar;
    this._signalK = signalK;
    this._infoPanel = infoPanel;
    this._scopePanel = scopePanel;

    this.state = AnchorState.UP;
    this.anchorCoordinates = null;
    this.maxRadius = initialRadius;

    this._toolbar.setRadius(this.maxRadius);
  }

  // === User-initiated transitions =================================================

  requestDrop() {
    if (this.state !== AnchorState.UP) return;
    const pos = this._overlay.getCrosshairPosition();
    if (!pos) return;

    this.state = AnchorState.DROPPING;
    this._enterDropped(pos, this.maxRadius);
    this._signalK
      .dropAnchor({ latitude: pos.lat, longitude: pos.lng }, this.maxRadius)
      .always(() => {
        this.state = AnchorState.ANCHORED;
        this._toolbar.setState(this.state);
      });
  }

  requestRaise() {
    if (this.state !== AnchorState.ANCHORED) return;

    this.state = AnchorState.RAISING;
    this._enterRaised();
    this._signalK
      .raiseAnchor()
      .always(() => {
        this.state = AnchorState.UP;
        this._toolbar.setState(this.state);
      });
  }

  setRadius(newRadius) {
    this.maxRadius = newRadius;
    this._toolbar.setRadius(newRadius);
    this._overlay.setRadius(newRadius);

    if (this.state === AnchorState.ANCHORED) {
      this._signalK.setRadius(newRadius);
    }
  }

  // === Server-initiated ===========================================================

  // Apply server-side anchor state. Skipped while a drop/raise POST is in flight —
  // the server doesn't reflect our pending change yet and would flip us back.
  reconcile({ on, position, maxRadius }) {
    if (this.state !== AnchorState.UP && this.state !== AnchorState.ANCHORED) return;

    if (on) {
      this.anchorCoordinates = position;
      this.maxRadius = maxRadius;
      if (this.state === AnchorState.UP) {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(position, maxRadius);
      } else {
        this._toolbar.setRadius(maxRadius);
        this._overlay.setRadius(maxRadius);
      }
    } else if (this.state === AnchorState.ANCHORED) {
      this.state = AnchorState.UP;
      this._enterRaised();
    }
  }

  // === Initial restore (called once from the /self load) ==========================

  restoreDropped(position, radius) {
    this.state = AnchorState.ANCHORED;
    this._enterDropped(position, radius);
  }

  restoreRaised(guessPosition) {
    this.anchorCoordinates = guessPosition;
    this._enterRaised();
  }

  // === Crosshair drag (overlay-driven while raised) ===============================

  updateCrosshairPosition(pos) {
    if (this.state === AnchorState.ANCHORED) return;
    this.anchorCoordinates = pos;
  }

  // === internals ==================================================================

  _enterDropped(position, radius) {
    this.anchorCoordinates = position;

    this.maxRadius = parseInt(radius, 10);
    if (this.maxRadius <= 0) this.maxRadius = 20;

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
