// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { DisplayUnit } from "../DisplayUnit.js";
import { formatScopeRatio } from "../../../shared/scopes.js";
import { setFieldText } from "./missingField.js";

export const ScopePanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "scope leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "scopeUI";
    container.style.display = "none";
    container.innerHTML = `
        <table id="scopeTable">
          <tbody id="scopeDepthTable">
            <tr>
              <th>Surface&nbsp;Depth</th>
              <td><span id='scopeDepth'></span></td>
            </tr>
            <tr id="bowHeightRow">
              <th>Bow&nbsp;Height</th>
              <td>+ <span id='bowHeight'></span></td>
            </tr>
            <tr id="tidalRiseRow">
              <th>Tidal&nbsp;Rise</th>
              <td>+ <span id='tidalRise'></span></td>
            </tr>
            <tr id="scopeTotalRow">
              <th>Total</th>
              <td>= <span id='scopeTotal'></span></td>
            </tr>
            <tr>
              <th colspan="2">&nbsp;</th>
            </tr>
            <!-- Per-ratio scope rows are inserted here dynamically, before this
                 trailing spacer, by _syncScopeRows(). -->
            <tr id="scopeRatioSpacer">
              <th colspan="2">&nbsp;</th>
            </tr>
          </tbody>
          <tbody id="minimumDepthTable">
            <tr id="belowKeelRow">
              <th>Below&nbsp;Keel</th>
              <td><span id='belowKeel'></span></td>
            </tr>
            <tr id="tidalFallRow">
              <th>Tidal&nbsp;Fall</th>
              <td>- <span id='tidalFall'></span></td>
            </tr>
            <tr id="minimumDepthRow">
              <th>Minimum&nbsp;Depth</th>
              <td>= <span id='minimumDepth'></span></td>
            </tr>
          </tbody>
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
      scopeRatioSpacer: container.querySelector("#scopeRatioSpacer"),
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
    // Value fields start as the missing placeholder until update() lands.
    for (const key of [
      "scopeDepth",
      "bowHeight",
      "tidalRise",
      "scopeTotal",
      "belowKeel",
      "tidalFall",
      "minimumDepth",
    ])
      setFieldText(this._refs[key], "");
    // Dynamically-built scope-ratio rows, kept in sync with state.scopes by
    // _syncScopeRows. `_scopeSig` is the ratio list that produced the current
    // rows, so we only rebuild the DOM when the configured ratios change.
    this._scopeRows = [];
    this._scopeSig = null;
    return container;
  },

  // Rebuild the per-ratio rows when the configured ratio list changes. Rows are
  // inserted before the trailing spacer so they sit between the Total line and
  // the minimum-depth section. No-op when the ratios are unchanged.
  _syncScopeRows: function (scopes) {
    const sig = scopes.map((s) => s.ratio).join(",");
    if (sig === this._scopeSig)
      return;
    this._scopeSig = sig;

    for (const entry of this._scopeRows)
      entry.row.remove();
    this._scopeRows = [];

    const spacer = this._refs.scopeRatioSpacer;
    for (const { ratio } of scopes) {
      const row = document.createElement("tr");
      const th = document.createElement("th");
      th.innerHTML = `${formatScopeRatio(ratio)}:1&nbsp;Scope`;
      const td = document.createElement("td");
      const value = document.createElement("span");
      setFieldText(value, "");
      td.appendChild(value);
      row.appendChild(th);
      row.appendChild(td);
      spacer.parentNode.insertBefore(row, spacer);
      this._scopeRows.push({ row, value });
    }

    // With no ratio rows the trailing spacer would double up with the one after
    // the Total row, leaving an empty gap — hide it so blank config reads clean.
    spacer.style.display = scopes.length ? "" : "none";
  },

  // Render a whole scope snapshot. Caller does the math; this is pure rendering
  // plus the green/orange/red warning on the minimum-depth row.
  //
  // Sections show/hide on envelope *presence* (a boat with no depth path never
  // grows the panel), but the values inside gate on the value actually being a
  // number: a sounder that loses bottom lock publishes value:null, and letting
  // that coerce (null + rise = rise) would render confidently wrong totals.
  // Anything unformattable renders as a grayed n/a (see setFieldText).
  update: function (state) {

    //if we have none of the required parameters, dont even show.
    if (!state.belowSurface && (!state.tide || !state.belowKeel))
      this.hide();
    else
      this.show();

    //scope depth calculation - only belowSurface is actually required
    if (state.belowSurface) {
      // Seed with NaN when the reading is missing so the Total (and anything
      // else derived from it) formats as n/a instead of a bogus number.
      const surfaceOk = Number.isFinite(state.belowSurface.value);
      let maxHeight = surfaceOk ? state.belowSurface.value : NaN;
      let showTotal = false;

      //do we also have tide?
      if (state.tide) {
        maxHeight += state.tidalRise;
        showTotal = true;
        setFieldText(this._refs.tidalRise, DisplayUnit.formatValue(state.tidalRise, "depth"));
        this._refs.tidalRiseRow.style.display = "";
      } else {
        this._refs.tidalRiseRow.style.display = "none";
      }

      //what bout anchor rollder height?
      if (state.boatConfig.anchorRollerHeight) {
        maxHeight += state.boatConfig.anchorRollerHeight;
        showTotal = true;
        setFieldText(this._refs.bowHeight, DisplayUnit.formatValue(state.boatConfig.anchorRollerHeight, "depth"));
        this._refs.bowHeightRow.style.display = "";
      }
      else
        this._refs.bowHeightRow.style.display = "none";

      setFieldText(this._refs.scopeDepth, DisplayUnit.formatDelta(state.belowSurface));

      if (showTotal) {
        setFieldText(this._refs.scopeTotal, DisplayUnit.formatValue(maxHeight, "depth"));
        this._refs.scopeTotalRow.style.display = "";
      }
      else
        this._refs.scopeTotalRow.style.display = "none";

      // Render one row per configured scope ratio, rebuilding the rows only
      // when the ratio list itself changes. Flag any scope whose rode length
      // exceeds the chain we actually carry. The lengths come from
      // calculateScope, which yields 0 when the surface depth is missing —
      // show n/a rather than a meaningless "0.0 m".
      const scopes = state.scopes || [];
      this._syncScopeRows(scopes);
      const chainLength = state.boatConfig?.totalAnchorChainLength;
      scopes.forEach(({ length }, i) => {
        const ref = this._scopeRows[i];
        if (!ref)
          return;
        setFieldText(
          ref.value,
          surfaceOk ? DisplayUnit.formatValue(length, "depth") : "",
        );
        ref.row.style.color =
          surfaceOk && chainLength && length > chainLength ? "red" : "";
      });

      this._refs.scopeDepthTable.style.display = "";
    } else {
      this._refs.scopeDepthTable.style.display = "none";
    }

    //minimum depth calculation - tide and belowKeel are both required
    if (state.tide && state.belowKeel) {

      setFieldText(this._refs.belowKeel, DisplayUnit.formatDelta(state.belowKeel));
      setFieldText(this._refs.tidalFall, DisplayUnit.formatValue(state.tidalFall, "depth"));

      let minimumDepth = Number.isFinite(state.belowKeel.value)
        ? state.belowKeel.value - state.tidalFall
        : NaN;
      setFieldText(this._refs.minimumDepth, DisplayUnit.formatValue(minimumDepth, "depth"));

      if (!Number.isFinite(minimumDepth)) {
        this._refs.minimumDepthRow.style.color = "";
      } else if (minimumDepth > 1) {
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
