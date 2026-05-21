// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { DisplayUnit } from "../DisplayUnit.js";

export const ScopePanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "scope leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "scopeUI";
    container.innerHTML = `
        <table id="scopeDepthTable">
          <tr>
            <th>Water&nbsp;Depth</th>
            <td><span id='scopeDepth'>~</span></td>
          </tr>
          <tr id="bowHeightRow">
            <th>Bow&nbsp;Height</th>
            <td>+ <span id='bowHeight'>~</span></td>
          </tr>
          <tr id="tidalRiseRow">
            <th>Tidal&nbsp;Rise</th>
            <td>+ <span id='tidalRise'>~</span></td>
          </tr>
          <tr id="scopeTotalRow">
            <th>Total</th>
            <td>= <span id='scopeTotal'>~</span></td>
          </tr>
          <tr>
            <th colspan="2">&nbsp;</th>
          </tr>
          <tr>
            <th>7:1&nbsp;Scope</th>
            <td><span id='scope7to1'>~</span></td>
          </tr>
          <tr>
            <th>5:1&nbsp;Scope</th>
            <td><span id='scope5to1'>~</span></td>
          </tr>
          <tr>
            <th>4:1&nbsp;Scope</th>
            <td><span id='scope4to1'>~</span></td>
          </tr>
          <tr>
            <th>3:1&nbsp;Scope</th>
            <td><span id='scope3to1'>~</span></td>
          </tr>
        </table>
        <table id="minimumDepthTable">
          <tr>
            <th colspan="2">&nbsp;</th>
          </tr>
          <tr id="belowKeelRow">
            <th>Below&nbsp;Keel</th>
            <td><span id='belowKeel'>~</span></td>
          </tr>
          <tr id="tidalFallRow">
            <th>Tidal&nbsp;Fall</th>
            <td>- <span id='tidalFall'>~</span></td>
          </tr>
          <tr id="minimumDepthRow">
            <th>Minimum&nbsp;Depth</th>
            <td>= <span id='minimumDepth'>~</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._refs = {
      scopeDepth: container.querySelector("#scopeDepth"),
      bowHeight: container.querySelector("#bowHeight"),
      tidalRise: container.querySelector("#tidalRise"),
      tidalRiseRow: container.querySelector("#tidalRiseRow"),
      scopeTotalRow: container.querySelector("#scopeTotalRow"),
      scopeTotal: container.querySelector("#scopeTotal"),
      scope7to1: container.querySelector("#scope7to1"),
      scope5to1: container.querySelector("#scope5to1"),
      scope4to1: container.querySelector("#scope4to1"),
      scope3to1: container.querySelector("#scope3to1"),
      belowKeel: container.querySelector("#belowKeel"),
      tidalFall: container.querySelector("#tidalFall"),
      bowHeightRow: container.querySelector("#bowHeightRow"),
      belowKeelRow: container.querySelector("#belowKeelRow"),
      tidalFallRow: container.querySelector("#tidalFallRow"),
      minimumDepth: container.querySelector("#minimumDepth"),
      minimumDepthRow: container.querySelector("#minimumDepthRow"),
      scopeDepthTable: container.querySelector("#scopeDepthTable"),
      minimumDepthTable: container.querySelector("#minimumDepthTable"),
    };
    return container;
  },

  // Render a whole scope snapshot. Caller does the math; this is pure rendering
  // plus the green/orange/red warning on the minimum-depth row.
  update: function (state) {

    //if we have none of the required parameters, dont even show.
    if (!state.belowSurface && (!state.tide || !state.belowKeel))
      this._container.style.display = "none";
    // only hide it, because this is conditional.
    // else
    //   this._container.style.display = "";

    //scope depth calculation - only belowSurface is actually required
    if (state.belowSurface) {
      let maxHeight = state.belowSurface.value;
      let showTotal = false;

      //do we also have tide?
      if (state.tide) {
        maxHeight += state.tidalRise;
        showTotal = true;
        this._refs.tidalRise.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.tidalRise);
        this._refs.tidalRiseRow.style.display = "";
      } else {
        this._refs.tidalRiseRow.style.display = "none";
      }

      //what bout anchor rollder height?
      if (state.boatConfig.anchorRollerHeight) {
        maxHeight += state.boatConfig.anchorRollerHeight;
        showTotal = true;
        this._refs.bowHeight.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.boatConfig.anchorRollerHeight);
        this._refs.bowHeightRow.style.display = "";
      }
      else
        this._refs.bowHeightRow.style.display = "none";

      this._refs.scopeDepth.innerHTML = DisplayUnit.formatDisplay(state.belowSurface);

      if (showTotal) {
        this._refs.scopeTotal.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, maxHeight);
        this._refs.scopeTotalRow.style.display = "";
      }
      else
        this._refs.scopeTotalRow.style.display = "none";

      this._refs.scope7to1.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.scope7);
      this._refs.scope5to1.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.scope5);
      this._refs.scope4to1.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.scope4);
      this._refs.scope3to1.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.scope3);

      this._refs.scopeDepthTable.style.display = "";
    } else {
      this._refs.scopeDepthTable.style.display = "none";
    }

    //minimum depth calculation - tide and belowKeel are both required
    if (state.tide && state.belowKeel) {

      this._refs.belowKeel.innerHTML = DisplayUnit.formatDisplay(state.belowKeel);
      this._refs.tidalFall.innerHTML = DisplayUnit.formatDisplay(state.belowSurface, false, state.tidalFall);

      let minimumDepth = state.belowKeel.value;
      if (state.tides)
        minimumDepth -= state.tidalFall;
      this._refs.minimumDepth.innerHTML = DisplayUnit.formatDisplay(state.belowKeel, false, minimumDepth);

      if (minimumDepth > 1) {
        this._refs.minimumDepthRow.style.color = "green";
      } else if (minimumDepth > 0) {
        this._refs.minimumDepthRow.style.color = "orange";
      } else {
        this._refs.minimumDepthRow.style.color = "red";
      }
      this._refs.minimumDepthTable.style.display = "";
    } else {
      this._refs.minimumDepthTable.style.display = "none";
    }
  },

  show: function () {
    if (this._container)
      this._container.style.display = "";
  },
  hide: function () {
    if (this._container)
      this._container.style.display = "none";
  },
});
