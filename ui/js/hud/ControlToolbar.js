// ControlToolbar owns the top control bar (raise/drop anchor buttons and the
// shape selector + per-shape controls). It builds its own DOM under the
// supplied parent and exposes onDrop/onRaise/onSetZone callbacks. Per-tick
// state comes from AppState via update(appState). The shape-specific UI
// is delegated to a zone controls instance from ./zones/.
// Element IDs are preserved for CSS hooks in style.css;
// do not rename without updating it.

import { createZoneControls, getZoneTypeOptions } from "./zones/index.js";
import { regularPolygonVertices } from "./zones/PolygonZoneOverlay.js";

export class ControlToolbar {
  constructor({ parent, getMapContainer, onDrop, onRaise, onSetZone }) {
    this._getMapContainer = getMapContainer;
    this._onDrop = onDrop;
    this._onRaise = onRaise;
    this._onSetZone = onSetZone;

    this._isAnchored = false;
    this._zoneControls = null;
    this._zoneType = null;
    this._appState = null;

    this._container = document.createElement("div");
    this._container.id = "controlToolbar";
    this._container.innerHTML = `
      <div id="anchorDown">
        <button id="raiseAnchor">Raise Anchor</button>
      </div>
      <div id="anchorUp">
        <button id="dropAnchor">Drop Anchor</button>
      </div>
      <div id="zoneShapeSelect">
        <select id="zoneShape"></select>
      </div>
      <div id="zoneControlsHost"></div>
    `;
    parent.appendChild(this._container);

    this._anchorUp = this._container.querySelector("#anchorUp");
    this._anchorDown = this._container.querySelector("#anchorDown");
    this._shapeSelectWrap = this._container.querySelector("#zoneShapeSelect");
    this._shapeSelect = this._container.querySelector("#zoneShape");
    this._zoneControlsHost = this._container.querySelector("#zoneControlsHost");

    // Populate the shape dropdown. Coming-soon types are listed but disabled
    // so the user can see what's planned without being able to select them.
    for (const option of getZoneTypeOptions()) {
      const opt = document.createElement("option");
      opt.value = option.type;
      opt.textContent = option.enabled ? option.label : `${option.label} (coming soon)`;
      opt.disabled = !option.enabled;
      this._shapeSelect.appendChild(opt);
    }

    this._container
      .querySelector("#raiseAnchor")
      .addEventListener("click", () => {
        if (!this._isAnchored)
          return;
        if (!confirm("Do you really want to disable your anchor alarm?"))
          return;
        if (this._onRaise)
          this._onRaise();
      });
    this._container
      .querySelector("#dropAnchor")
      .addEventListener("click", () => {
        if (this._onDrop)
          this._onDrop();
      });
    this._shapeSelect.addEventListener("change", (e) => {
      if (this._onSetZone)
        this._onSetZone(this._defaultZoneConfig(e.target.value));
    });

    // macOS Chrome delivers trackpad pinch as a wheel event with ctrlKey=true.
    // Over this overlay the browser would zoom the page instead of the map,
    // so swallow the default and re-dispatch onto the map container.
    this._container.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey)
          return;
        e.preventDefault();
        const target = this._getMapContainer && this._getMapContainer();
        if (!target)
          return;
        target.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            ctrlKey: e.ctrlKey,
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: false,
            cancelable: true,
          }),
        );
      },
      { passive: false },
    );
  }

  // Swap which button group is visible based on AppState. "Anchored" shows the
  // raise button; "raised" shows the drop button + shape selector. The
  // per-shape controls render in both states (so a user can adjust zone
  // either before dropping or while anchored).
  update(appState) {
    this._appState = appState;
    this._isAnchored = appState.isAnchored();
    this._anchorDown.style.display = this._isAnchored ? "block" : "none";
    this._anchorUp.style.display = this._isAnchored ? "none" : "block";
    // Shape can only be changed while raised; while anchored the user can
    // still tweak the parameters of the existing shape.
    this._shapeSelectWrap.style.display = this._isAnchored ? "none" : "block";

    const zone = appState.getWatchZone();
    const type = zone.getType();
    this._ensureZoneControls(type);
    if (this._shapeSelect.value !== type)
      this._shapeSelect.value = type;
    this._zoneControls?.update(appState);
  }

  // Build a default zone config when the user picks a new shape from the
  // dropdown. Circle keeps v2.1's "reset to backend default" behavior;
  // sector inherits the current radius (so switching circle → sector at 30m
  // doesn't snap to 60m) and centers a 120° arc opposite the current heading
  // — the boat points into the wind/current at anchor, so the safe swing
  // arc lies astern.
  _defaultZoneConfig(type) {
    if (type === "circle")
      return { type: "circle" };
    if (type === "sector") {
      const current = this._appState?.anchor?.watchZone?.value;
      const currentRadius = Number(current?.radius);
      const radius = Number.isFinite(currentRadius) && currentRadius > 0 ? currentRadius : 60;
      const heading = this._appState?.boatConfig?.heading;
      const center = ((Number.isFinite(heading) ? heading : 0) + 180) % 360;
      const startAngle = (center - 60 + 360) % 360;
      const endAngle = (center + 60) % 360;
      return { type: "sector", radius, startAngle, endAngle };
    }
    if (type === "polygon") {
      // Default to a regular 8-gon at 60m. PolygonZoneControls owns the
      // editable side count + radius; this is just the initial shape on
      // first switch into polygon mode.
      return { type: "polygon", vertices: regularPolygonVertices(8, 60) };
    }
    return { type };
  }

  _ensureZoneControls(type) {
    if (this._zoneControls && this._zoneType === type)
      return;
    if (this._zoneControls)
      this._zoneControls.destroy();
    this._zoneControls = createZoneControls(type, {
      parent: this._zoneControlsHost,
      onChange: (zoneConfig) => {
        if (this._onSetZone)
          this._onSetZone(zoneConfig);
      },
    });
    this._zoneType = type;
  }
}
