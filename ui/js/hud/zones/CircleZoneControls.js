// DOM controls for editing a circle watch zone (the +/- radius stepper plus a
// click-to-type prompt). The host (ControlToolbar) owns the parent element and
// the onChange callback; the control instance owns its own DOM and updates the
// radius display each tick. Element IDs are preserved from the v2.1 toolbar
// so the existing style.css rules keep working.

import { DisplayUnit } from "../../DisplayUnit.js";

export class CircleZoneControls {
  static get type() {
    return "circle";
  }

  // onChange(zoneConfig) — radius is already canonical (meters); any display
  // unit conversion happens inside this control before emit.
  constructor({ parent, onChange }) {
    this._onChange = onChange;
    this._radius = 0;
    this._maxRadiusEnvelope = null;

    this._container = document.createElement("div");
    this._container.id = "radiusControl";
    this._container.innerHTML = `
      <button id="decreaseRadius">-</button>
      <button id="setRadius"><span id="radius">0</span></button>
      <button id="increaseRadius">+</button>
    `;
    parent.appendChild(this._container);

    this._radiusEl = this._container.querySelector("#radius");

    this._container
      .querySelector("#setRadius")
      .addEventListener("click", () => {
        const input = prompt("Enter Radius:", parseInt(this._radiusEl.innerHTML, 10));
        if (input === null)
          return;
        const newRadius = parseInt(input, 10);
        if (isNaN(newRadius) || newRadius <= 0)
          return;
        this._emit(newRadius, true);
      });
    this._container
      .querySelector("#increaseRadius")
      .addEventListener("click", () => {
        this._emit(this._radius + 5, false);
      });
    this._container
      .querySelector("#decreaseRadius")
      .addEventListener("click", () => {
        if (this._radius <= 5)
          return;
        this._emit(this._radius - 5, false);
      });
  }

  _emit(newRadius, convert) {
    let radius = newRadius;
    if (convert && this._maxRadiusEnvelope)
      radius = DisplayUnit.convertFromDisplay(this._maxRadiusEnvelope, newRadius);
    if (this._onChange)
      this._onChange({ type: "circle", radius });
  }

  update(appState) {
    this._radius = appState.anchor?.maxRadius?.value ?? 0;
    this._maxRadiusEnvelope = appState.anchor?.maxRadius ?? null;
    if (this._maxRadiusEnvelope)
      this._radiusEl.innerHTML = DisplayUnit.formatDisplay(this._maxRadiusEnvelope, 0, this._radius);
    else
      this._radiusEl.innerHTML = this._radius;
  }

  destroy() {
    if (this._container.parentNode)
      this._container.parentNode.removeChild(this._container);
  }
}
