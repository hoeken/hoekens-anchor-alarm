// DOM controls for editing a sector watch zone. Same +/- radius stepper as
// CircleZoneControls — start/end angles are edited only via the map handles.
// We hang onto the latest zone config so radius edits preserve the current
// angles (otherwise SectorZone's constructor would backfill defaults and
// clobber the user's bearing settings).

import { DisplayUnit } from "../../DisplayUnit.js";
import { Modal } from "../Modal.js";

export class SectorZoneControls {
  static get type() {
    return "sector";
  }

  constructor({ parent, onChange }) {
    this._onChange = onChange;
    this._radius = 0;
    this._zone = null;

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
      this._onChange({
        ...(this._zone || {}),
        type: "sector",
        radius,
      });
  }

  update(appState) {
    const zoneCfg = appState.anchor?.watchZone?.value;
    this._zone = (zoneCfg && zoneCfg.type === "sector") ? zoneCfg : null;
    this._radius = this._zone?.radius ?? 0;
    this._radiusEl.innerHTML = DisplayUnit.formatValue(this._radius, "depth", 0);
  }

  destroy() {
    if (this._container.parentNode)
      this._container.parentNode.removeChild(this._container);
  }
}
