// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { DisplayUnit } from "../DisplayUnit.js";
import { setTitle } from "../BrowserSupport.js";
import { GeoMath } from "../GeoMath.js";
import { setFieldText, fieldIsStale } from "./missingField.js";

export const InfoPanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "info leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "infoUI";
    container.style.display = "none";
    container.innerHTML = `
        <table>
          <tr>
            <th>Distance:</th>
            <td><span id='distanceValue'></span></td>
          </tr>
          <tr>
            <th>Depth:</th>
            <td><span id='depthValue'></span></td>
          </tr>
          <tr>
            <th>Status:</th>
            <td><span id='pluginStatus'>Loading</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._distanceValue = container.querySelector("#distanceValue");
    setTitle(this._distanceValue, "Distance to Anchor");
    this._depthValue = container.querySelector("#depthValue");
    setTitle(this._depthValue, "Depth");
    this._pluginStatus = container.querySelector("#pluginStatus");
    // Value fields start as the missing placeholder until update() lands.
    setFieldText(this._distanceValue, "");
    setFieldText(this._depthValue, "");
    return container;
  },

  update: function (state) {
    this.show();

    this.setDistanceValue(this._bowToAnchor(state), state.currentCoordinates);
    // Depth sources actually holding a number: an envelope whose value went
    // null (a sounder that lost bottom lock publishes value:null) must not
    // shadow a sibling path that still has a reading. Among those, prefer one
    // that's still updating — a dead feed shouldn't shadow a live sibling —
    // and only fall back to a stale reading (rendered dimmed) when every
    // source has gone quiet.
    const usable = [state.belowSurface, state.belowKeel, state.belowTransducer]
      .filter((d) => Number.isFinite(d?.value));
    const depth = usable.find((d) => !fieldIsStale(d)) ?? usable[0] ?? null;
    this.setDepthValue(depth);
    this.setStatus(state.anchor);
  },

  // Bow-to-anchor distance via the same GeoMath helper AnchorOverlay uses for
  // the rode line, so the info box always agrees with the map's label.
  _bowToAnchor: function (state) {
    if (!state.isAnchored() || !state.currentCoordinates || !state.anchor.position?.value)
      return null;
    return GeoMath.bowToAnchor(
      state.getPosition(),
      state.boatConfig.heading,
      state.boatConfig.gpsOffset,
      state.getAnchorPosition(),
    ).distance;
  },

  // Distance dims when the GPS fix backing it has gone stale — the anchor end
  // of the line is a fixed point, so the fix is the live input.
  setDistanceValue: function (distance, position) {
    setFieldText(
      this._distanceValue,
      distance != null ? DisplayUnit.formatValue(distance, "depth") : "",
      position,
    );
  },

  setDepthValue: function (depth) {
    setFieldText(
      this._depthValue,
      depth ? DisplayUnit.formatDelta(depth) : "",
      depth,
    );
  },

  setStatus: function (anchor) {
    this._pluginStatus.className = "";
    const notice = anchor.notification?.value;
    if (anchor.state && anchor.state.value === "off") {
      this._pluginStatus.textContent = "Off";
    } else if (anchor.state && anchor.state.value === "on") {
      // notice is null when normal-state notifications are disabled; the anchor
      // is still set, so display it as watching.
      if (!notice || notice.state === "normal" || notice.message === "Watching") {
        this._pluginStatus.classList.add("normal");
        this._pluginStatus.textContent = "Watching";
      } else {
        this._pluginStatus.classList.add(notice.state);
        this._pluginStatus.textContent = notice.state.toUpperCase();
      }
    } else {
      this._pluginStatus.textContent = "Unknown";
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
