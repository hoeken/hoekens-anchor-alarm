// ControlToolbar owns the top control bar (raise/drop anchor buttons and the
// shape selector + per-shape controls). It builds its own DOM under the
// supplied parent and exposes onDrop/onRaise/onSetZone callbacks. Per-tick
// state comes from AppState via update(appState). The shape-specific UI
// is delegated to a zone controls instance from ./zones/.
// Element IDs are preserved for CSS hooks in style.css;
// do not rename without updating it.
//
// Layout: the three controls sit in one horizontal row, each 90px tall.
// Visual order (left→right) is shape picker, radius panel, raise/drop button.

import {
  createDefaultZoneConfig,
  createZoneControls,
  getZoneTypeOptions,
} from "./zones/index.js";
import { Modal } from "./Modal.js";

// SVG glyphs for the shape picker — a native <select> can't render markup in
// its options, so the picker is a small custom dropdown and each shape is drawn
// as an outline that mirrors its watch-zone footprint. fill/stroke follow
// currentColor so both themes work with no per-icon override.
const SHAPE_ICONS = {
  circle: `<circle cx="12" cy="12" r="8"/>`,
  // 90° wedge with its apex near the bottom, opening upward — a recognizable
  // pie slice that fills the frame (mirrors the sector watch zone spreading out
  // from the anchor).
  sector: `<path d="M12 20 L1.4 9.4 A15 15 0 0 1 22.6 9.4 Z"/>`,
  // Regular octagon (the polygon zone's 8-side default).
  polygon: `<polygon points="9,4 15,4 20,9 20,15 15,20 9,20 4,15 4,9"/>`,
};

function shapeIconMarkup(type) {
  const inner = SHAPE_ICONS[type] || SHAPE_ICONS.circle;
  return `<svg class="zoneShapeGlyph" viewBox="0 0 24 24" width="40" height="40"
    fill="none" stroke="currentColor" stroke-width="2"
    stroke-linejoin="round">${inner}</svg>`;
}

export class ControlToolbar {
  constructor({ parent, getMapContainer, onDrop, onRaise, onSetZone, onLogin }) {
    this._getMapContainer = getMapContainer;
    this._onDrop = onDrop;
    this._onRaise = onRaise;
    this._onSetZone = onSetZone;
    this._onLogin = onLogin;

    this._isAnchored = false;
    this._zoneControls = null;
    this._zoneType = null;
    this._appState = null;
    this._shapeType = null;

    // Coming-soon types are listed but disabled so the user can see what's
    // planned without being able to select them.
    const shapeOptions = getZoneTypeOptions()
      .map(
        (option) => `
        <button type="button" class="zoneShapeOption" data-type="${option.type}"
          title="${option.enabled ? option.label : `${option.label} (coming soon)`}"
          ${option.enabled ? "" : "disabled"}>
          ${shapeIconMarkup(option.type)}
        </button>`,
      )
      .join("");

    this._container = document.createElement("div");
    this._container.id = "controlToolbar";
    this._container.innerHTML = `
      <div id="loginPrompt">
        <button id="loginButton">Login</button>
      </div>
      <div id="zoneShapeSelect">
        <button type="button" id="zoneShapeButton" aria-haspopup="true" aria-expanded="false">
          <span id="zoneShapeCurrent">${shapeIconMarkup("circle")}</span>
          <svg class="zoneShapeCaret" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
            <path fill="currentColor" d="M0 0l6 8 6-8z"/>
          </svg>
        </button>
        <div id="zoneShapeMenu" hidden>${shapeOptions}</div>
      </div>
      <div id="zoneControlsHost"></div>
      <div id="anchorDown">
        <button id="raiseAnchor">
          <img class="anchorBtnIcon" src="icons/anchor-transparent-100px.png" alt="" />
          <span class="anchorBtnLabel">Raise</span>
        </button>
      </div>
      <div id="anchorUp">
        <button id="dropAnchor">
          <img class="anchorBtnIcon" src="icons/anchor-transparent-100px.png" alt="" />
          <span class="anchorBtnLabel">Drop</span>
        </button>
      </div>
    `;
    parent.appendChild(this._container);

    this._loginPrompt = this._container.querySelector("#loginPrompt");
    this._anchorUp = this._container.querySelector("#anchorUp");
    this._anchorDown = this._container.querySelector("#anchorDown");
    this._shapeSelectWrap = this._container.querySelector("#zoneShapeSelect");
    this._shapeButton = this._container.querySelector("#zoneShapeButton");
    this._shapeCurrent = this._container.querySelector("#zoneShapeCurrent");
    this._shapeMenu = this._container.querySelector("#zoneShapeMenu");
    this._zoneControlsHost = this._container.querySelector("#zoneControlsHost");

    this._container
      .querySelector("#loginButton")
      .addEventListener("click", () => {
        // Log in within the app (see AnchorAlarm.showLoginModal) rather than
        // bouncing to the SignalK admin SPA — that redirect never came back on
        // the Navico MFD.
        if (this._onLogin)
          this._onLogin();
      });
    this._container
      .querySelector("#raiseAnchor")
      .addEventListener("click", async () => {
        if (!this._isAnchored)
          return;
        // Native confirm() freezes the Navico WebView, so the raise never ran;
        // route through the reusable Modal instead.
        const ok = await Modal.confirm({
          title: "Raise Anchor",
          message: "Do you really want to disable your anchor alarm?",
          okLabel: "Raise Anchor",
          cancelLabel: "Cancel",
        });
        if (!ok)
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

    // Custom shape dropdown: the button toggles the menu; picking an option
    // sets the shape and closes it; a click anywhere else dismisses it.
    this._shapeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleShapeMenu();
    });
    this._shapeMenu.addEventListener("click", (e) => {
      const option = e.target.closest(".zoneShapeOption");
      if (!option || option.disabled)
        return;
      this._closeShapeMenu();
      const type = option.dataset.type;
      if (type !== this._shapeType && this._onSetZone)
        this._onSetZone(createDefaultZoneConfig(type, this._appState));
    });
    // Dismiss the open menu on any outside interaction.
    this._onDocumentClick = () => this._closeShapeMenu();
    document.addEventListener("click", this._onDocumentClick);

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

  _toggleShapeMenu() {
    if (this._shapeMenu.hidden)
      this._openShapeMenu();
    else
      this._closeShapeMenu();
  }

  _openShapeMenu() {
    this._shapeMenu.hidden = false;
    this._shapeButton.setAttribute("aria-expanded", "true");
  }

  _closeShapeMenu() {
    if (this._shapeMenu.hidden)
      return;
    this._shapeMenu.hidden = true;
    this._shapeButton.setAttribute("aria-expanded", "false");
  }

  // Reflect the active shape in the collapsed button glyph and highlight the
  // matching option in the menu.
  _setShapeType(type) {
    if (this._shapeType === type)
      return;
    this._shapeType = type;
    this._shapeCurrent.innerHTML = shapeIconMarkup(type);
    for (const option of this._shapeMenu.querySelectorAll(".zoneShapeOption"))
      option.classList.toggle("active", option.dataset.type === type);
  }

  // Swap which button group is visible based on AppState. "Anchored" shows the
  // raise button; "raised" shows the drop button + shape selector. The
  // per-shape controls render in both states (so a user can adjust zone
  // either before dropping or while anchored).
  update(appState) {
    this._appState = appState;

    // Anonymous users can't drop/raise the anchor or set a zone (those POSTs
    // are auth-gated server-side), so show a Login button in place of the
    // whole control set and bail before touching it. (The settings gear also
    // opens the login modal — see ConfigPanel.)
    const loggedIn = appState.loggedIn;
    this._loginPrompt.style.display = loggedIn ? "none" : "block";
    if (!loggedIn) {
      this._anchorDown.style.display = "none";
      this._anchorUp.style.display = "none";
      this._shapeSelectWrap.style.display = "none";
      this._zoneControlsHost.style.display = "none";
      this._closeShapeMenu();
      return;
    }
    this._zoneControlsHost.style.display = "";

    this._isAnchored = appState.isAnchored();
    this._anchorDown.style.display = this._isAnchored ? "block" : "none";
    this._anchorUp.style.display = this._isAnchored ? "none" : "block";
    // Shape can only be changed while raised; while anchored the user can
    // still tweak the parameters of the existing shape.
    this._shapeSelectWrap.style.display = this._isAnchored ? "none" : "block";
    if (this._isAnchored)
      this._closeShapeMenu();

    const zone = appState.getWatchZone();
    const type = zone.getType();
    this._ensureZoneControls(type);
    this._setShapeType(type);
    this._zoneControls?.update(appState);
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
