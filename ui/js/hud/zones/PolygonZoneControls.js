// DOM controls for editing a polygon watch zone. Two controls:
//   - sides dropdown (3..12, default 8) — local UI state only; doesn't
//     touch the zone until reset is pressed.
//   - reset button — regenerates a regular N-gon with the local sides count
//     at a local default radius

import { regularPolygonVertices } from "./PolygonZoneOverlay.js";

const SIDES_MIN = 3;
const SIDES_MAX = 12;
const DEFAULT_SIDES = 8;
const DEFAULT_RADIUS_M = 60;

export class PolygonZoneControls {
  static get type() {
    return "polygon";
  }

  constructor({ parent, onChange }) {
    this._onChange = onChange;
    this._sides = DEFAULT_SIDES;
    this._radius = DEFAULT_RADIUS_M;

    this._container = document.createElement("div");
    this._container.id = "polygonControl";
    const options = [];
    for (let n = SIDES_MIN; n <= SIDES_MAX; n++)
      options.push(`<option value="${n}"${n === DEFAULT_SIDES ? " selected" : ""}>Sides: ${n}</option>`);
    this._container.innerHTML = `
      <select id="polygonSides">${options.join("")}</select>
      <button id="polygonReset">Reset</button>
    `;
    parent.appendChild(this._container);

    this._sidesEl = this._container.querySelector("#polygonSides");
    this._sidesEl.addEventListener("change", () => {
      const n = parseInt(this._sidesEl.value, 10);
      if (Number.isFinite(n))
        this._sides = n;
    });
    this._container
      .querySelector("#polygonReset")
      .addEventListener("click", () => this._emitReset());
  }

  _emitReset() {
    if (!this._onChange)
      return;
    this._onChange({
      type: "polygon",
      vertices: regularPolygonVertices(this._sides, this._radius),
    });
  }

  update(appState) {
    this._radius = appState.getDefaultRadius();
  }

  destroy() {
    if (this._container.parentNode)
      this._container.parentNode.removeChild(this._container);
  }
}
