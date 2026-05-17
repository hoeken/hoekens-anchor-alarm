// ControlToolbar owns the bottom map_toggle bar (raise/drop anchor buttons and
// the +/- radius stepper). It binds to the static HTML in index.html, hides
// jQuery from the host, and exposes onDrop/onRaise/onSetRadius callbacks plus
// setState(anchorState) and setRadius(r) update methods. Element IDs are
// preserved for CSS hooks in style.css; do not rename without updating it.

class ControlToolbar {

  constructor({ getMapContainer, onDrop, onRaise, onSetRadius }) {
    this._getMapContainer = getMapContainer;
    this._onDrop = onDrop;
    this._onRaise = onRaise;
    this._onSetRadius = onSetRadius;

    this._radius = 0;

    this._container  = document.getElementById('map_toggle');
    this._anchorUp   = document.getElementById('anchorUp');
    this._anchorDown = document.getElementById('anchorDown');
    this._radiusEl   = document.getElementById('radius');

    document.getElementById('raiseAnchor').addEventListener('click', () => {
      if (this._onRaise) this._onRaise();
    });
    document.getElementById('dropAnchor').addEventListener('click', () => {
      if (this._onDrop) this._onDrop();
    });
    document.getElementById('setRadius').addEventListener('click', () => {
      const input = prompt('Enter Radius (m)', this._radius);
      if (input === null) return;
      const newRadius = parseInt(input, 10);
      if (isNaN(newRadius) || newRadius <= 0) return;
      if (this._onSetRadius) this._onSetRadius(newRadius);
    });
    document.getElementById('increaseRadius').addEventListener('click', () => {
      if (this._onSetRadius) this._onSetRadius(this._radius + 5);
    });
    document.getElementById('decreaseRadius').addEventListener('click', () => {
      if (this._radius <= 5) return;
      if (this._onSetRadius) this._onSetRadius(this._radius - 5);
    });

    // macOS Chrome delivers trackpad pinch as a wheel event with ctrlKey=true.
    // Over this overlay the browser would zoom the page instead of the map,
    // so swallow the default and re-dispatch onto the map container.
    this._container.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const target = this._getMapContainer && this._getMapContainer();
      if (!target) return;
      target.dispatchEvent(new WheelEvent('wheel', {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: false,
        cancelable: true,
      }));
    }, { passive: false });
  }

  // Swap which button group is visible. "Down" states show the raise button;
  // "up" states show the drop button. Use 'block' (not '') because the CSS
  // default for these divs is display:none.
  setState(anchorState) {
    const isDown = anchorState === AnchorState.ANCHORED || anchorState === AnchorState.DROPPING;
    this._anchorDown.style.display = isDown ? 'block' : 'none';
    this._anchorUp.style.display   = isDown ? 'none'  : 'block';
  }

  setRadius(radius) {
    this._radius = radius;
    this._radiusEl.innerHTML = radius;
  }
}
