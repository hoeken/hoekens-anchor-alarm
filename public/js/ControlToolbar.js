// ControlToolbar owns the top control bar (raise/drop anchor buttons and the
// +/- radius stepper). It builds its own DOM under the supplied parent, hides
// jQuery from the host, and exposes onDrop/onRaise/onSetRadius callbacks plus
// setState(anchorState) and setRadius(r) update methods. Element IDs are
// preserved for CSS hooks in style.css; do not rename without updating it.

class ControlToolbar {

  constructor({ parent, getMapContainer, onDrop, onRaise, onSetRadius }) {
    this._getMapContainer = getMapContainer;
    this._onDrop = onDrop;
    this._onRaise = onRaise;
    this._onSetRadius = onSetRadius;

    this._radius = 0;
    this._state = null;

    this._container = document.createElement('div');
    this._container.id = 'controlToolbar';
    this._container.innerHTML = `
      <div id="anchorDown">
        <button id="raiseAnchor">Raise Anchor</button>
      </div>
      <div id="anchorUp">
        <button id="dropAnchor">Drop Anchor</button>
      </div>
      <div id="radiusControl">
        <button id="decreaseRadius">-</button>
        <button id="setRadius"><span id="radius">0</span>m</button>
        <button id="increaseRadius">+</button>
      </div>
    `;
    parent.appendChild(this._container);

    this._anchorUp   = this._container.querySelector('#anchorUp');
    this._anchorDown = this._container.querySelector('#anchorDown');
    this._radiusEl   = this._container.querySelector('#radius');

    this._container.querySelector('#raiseAnchor').addEventListener('click', () => {
      if (this._state !== AnchorState.ANCHORED) return;
      if (!confirm('Do you really want to disable your anchor alarm?')) return;
      if (this._onRaise) this._onRaise();
    });
    this._container.querySelector('#dropAnchor').addEventListener('click', () => {
      if (this._onDrop) this._onDrop();
    });
    this._container.querySelector('#setRadius').addEventListener('click', () => {
      const input = prompt('Enter Radius (m)', this._radius);
      if (input === null) return;
      const newRadius = parseInt(input, 10);
      if (isNaN(newRadius) || newRadius <= 0) return;
      if (this._onSetRadius) this._onSetRadius(newRadius);
    });
    this._container.querySelector('#increaseRadius').addEventListener('click', () => {
      if (this._onSetRadius) this._onSetRadius(this._radius + 5);
    });
    this._container.querySelector('#decreaseRadius').addEventListener('click', () => {
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
    this._state = anchorState;
    const isDown = anchorState === AnchorState.ANCHORED || anchorState === AnchorState.DROPPING;
    this._anchorDown.style.display = isDown ? 'block' : 'none';
    this._anchorUp.style.display   = isDown ? 'none'  : 'block';
  }

  setRadius(radius) {
    this._radius = radius;
    this._radiusEl.innerHTML = radius;
  }
}
