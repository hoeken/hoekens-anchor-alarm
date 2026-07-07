// DOM controls for editing a polygon watch zone. Two controls stacked in one
// box, radius on top / sides below, matching the circle/sector radius panel:
//   - radius value (tap to type an exact value via Modal) — scales the current
//     polygon in place so freehand edits (dragged vertices) are preserved.
//   - sides dropdown (3..12, default 6 to match the backend default) —
//     regenerates a regular N-gon at the current radius as soon as the count
//     changes (side count can't be changed without rebuilding the shape).
// There are deliberately no +/- steppers here: sitting next to the sides
// selector a bare +/- would be ambiguous (does it step sides or radius?), so we
// show the explicit numeric value instead.
//
// A polygon stores per-vertex distances rather than a single radius, so the
// displayed value is its circle-equivalent radius (the farthest vertex, via
// getCircleRadius) — the same measure AppState.getDefaultRadius reads, so the
// size carries over when switching shapes.

import { DisplayUnit } from "../../DisplayUnit.js";
import { Modal } from "../Modal.js";
import { regularPolygonVertices } from "./PolygonZoneOverlay.js";

const SIDES_MIN = 3;
const SIDES_MAX = 12;
const DEFAULT_SIDES = 6;
const DEFAULT_RADIUS_M = 60;

export class PolygonZoneControls {
  static get type() {
    return "polygon";
  }

  constructor({ parent, onChange }) {
    this._onChange = onChange;
    this._sides = DEFAULT_SIDES;
    this._radius = DEFAULT_RADIUS_M;
    // Latest committed vertices, kept so a radius change can scale them in
    // place. Null until a polygon exists.
    this._vertices = null;

    // Element IDs (setRadius/radius) match the style.css hooks shared with the
    // circle/sector radius panel so the value styling (14px, nowrap so a wide
    // "333 ft" fits) carries over for free.
    this._container = document.createElement("div");
    this._container.id = "polygonControl";
    const options = [];
    for (let n = SIDES_MIN; n <= SIDES_MAX; n++)
      options.push(`<option value="${n}"${n === DEFAULT_SIDES ? " selected" : ""}>${n} sides</option>`);
    this._container.innerHTML = `
      <button id="setRadius"><span id="radius">0</span></button>
      <select id="polygonSides">${options.join("")}</select>
    `;
    parent.appendChild(this._container);

    this._sidesEl = this._container.querySelector("#polygonSides");
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
        const display = parseInt(input, 10);
        if (isNaN(display) || display <= 0)
          return;
        const cfg = DisplayUnit.categoryConfig("depth");
        this._setRadius(DisplayUnit.convertFromDisplay(cfg, display));
      });
    this._sidesEl.addEventListener("change", () => {
      const n = parseInt(this._sidesEl.value, 10);
      if (!Number.isFinite(n))
        return;
      this._sides = n;
      // Changing the side count can't preserve a freehand shape, so rebuild a
      // regular N-gon — keeping the current radius.
      this._emit(regularPolygonVertices(this._sides, this._radius));
    });
  }

  // Resize the polygon to `radius` meters. Scale the existing vertices about the
  // anchor (a similarity transform, so it preserves shape and stays simple);
  // fall back to a fresh regular N-gon if there's nothing to scale yet.
  _setRadius(radius) {
    const scalable =
      Array.isArray(this._vertices) &&
      this._vertices.length >= SIDES_MIN &&
      this._radius > 0;
    const next = scalable
      ? this._vertices.map((v) => ({
        bearing: v.bearing,
        distance: (v.distance * radius) / this._radius,
      }))
      : regularPolygonVertices(this._sides, radius);
    this._radius = radius;
    this._radiusEl.innerHTML = DisplayUnit.formatValue(radius, "depth", 0);
    this._emit(next);
  }

  // Commit vertices, caching them so the next radius scale works off the latest
  // shape without waiting for the round-trip through AppState.
  _emit(vertices) {
    this._vertices = vertices;
    if (this._onChange)
      this._onChange({ type: "polygon", vertices });
  }

  update(appState) {
    // Use the zone's circle-equivalent radius (the farthest vertex) as the
    // representative size — the same measure getDefaultRadius reads, so what's
    // shown here is what carries over on a shape switch. Fall back to the app's
    // default radius before any polygon exists.
    const zone = appState.getWatchZone();
    if (zone.getType() === "polygon" && zone.vertices.length) {
      this._vertices = zone.vertices;
      this._radius = zone.getCircleRadius();
    } else {
      this._vertices = null;
      this._radius = appState.getDefaultRadius();
    }
    this._radiusEl.innerHTML = DisplayUnit.formatValue(this._radius, "depth", 0);
  }

  destroy() {
    if (this._container.parentNode)
      this._container.parentNode.removeChild(this._container);
  }
}
