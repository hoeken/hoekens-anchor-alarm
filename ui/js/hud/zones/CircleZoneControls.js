// DOM controls for editing a circle watch zone (the +/- radius stepper plus a
// click-to-type prompt). The host (ControlToolbar) owns the parent element and
// the onChange callback; the control instance owns its own DOM and updates the
// radius display each tick. Element IDs are preserved from the v2.1 toolbar
// so the existing style.css rules keep working.

import { DisplayUnit } from "../../DisplayUnit.js";
import { Modal } from "../Modal.js";

export class CircleZoneControls {
  static get type() {
    return "circle";
  }

  // onChange(zoneConfig) — radius is already canonical (meters); any display
  // unit conversion happens inside this control before emit.
  constructor({ parent, onChange }) {
    this._onChange = onChange;
    this._radius = 0;

    // All-in-one panel: the radius value sits on top (click to type a value),
    // with the -/+ steppers as two equal columns below. Element IDs match the
    // style.css hooks shared with SectorZoneControls.
    this._container = document.createElement("div");
    this._container.id = "radiusControl";
    this._container.innerHTML = `
      <button id="setRadius"><span id="radius">0</span></button>
      <div id="radiusStepper">
        <button id="decreaseRadius">−</button>
        <button id="increaseRadius">+</button>
      </div>
    `;
    parent.appendChild(this._container);

    this._radiusEl = this._container.querySelector("#radius");

    this._container
      .querySelector("#setRadius")
      .addEventListener("click", async () => {
        // Native prompt() freezes the Navico WebView; use the reusable Modal.
        const current = parseInt(this._radiusEl.innerHTML, 10);
        const input = await Modal.prompt({
          title: "Set Radius",
          message: "Enter Radius:",
          value: isNaN(current) ? "" : current,
          inputType: "number",
          inputMode: "numeric",
          okLabel: "Set",
        });
        if (input == null)
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
    if (convert) {
      let cfg = DisplayUnit.categoryConfig("depth");
      radius = DisplayUnit.convertFromDisplay(cfg, newRadius);
    }
    if (this._onChange)
      this._onChange({ type: "circle", radius });
  }

  update(appState) {
    this._radius = appState.anchor?.watchZone?.value?.radius ?? 0;
    this._radiusEl.innerHTML = DisplayUnit.formatValue(this._radius, "depth", 0);
  }

  destroy() {
    if (this._container.parentNode)
      this._container.parentNode.removeChild(this._container);
  }
}
