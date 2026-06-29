// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { DisplayUnit } from "../DisplayUnit.js";
import { setTitle } from "../BrowserSupport.js";

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
            <th>Depth:</th>
            <td><span id='depthValue'>~</span></td>
          </tr>
          <tr>
            <th>Status:</th>
            <td><span id='pluginStatus'>Loading</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._depthValue = container.querySelector("#depthValue");
    setTitle(this._depthValue, "Depth");
    this._pluginStatus = container.querySelector("#pluginStatus");
    return container;
  },

  update: function (state) {
    this.show();

    if (state.belowSurface)
      this.setDepthValue(state.belowSurface);
    else if (state.belowKeel)
      this.setDepthValue(state.belowKeel);
    else if (state.belowTransducer)
      this.setDepthValue(state.belowTransducer);
    else
      this.setDepthValue(null);
    this.setStatus(state.anchor);
  },

  setDepthValue: function (depth) {
    if (depth)
      this._depthValue.textContent = DisplayUnit.formatDelta(depth);
    else
      this._depthValue.textContent = "~";
  },

  setStatus: function (anchor) {
    this._pluginStatus.className = "";
    if (anchor.state && anchor.notification) {
      if (anchor.state.value === "off")
        this._pluginStatus.textContent = "Off";
      else if (anchor.state.value === "on") {
        const notice = anchor.notification;
        this._pluginStatus.classList.add(notice.value.state);
        if (notice.value.message === "Watching")
          this._pluginStatus.textContent = "Watching";
        else
          this._pluginStatus.textContent = notice.value.state.toUpperCase();
      }
    } else
      this._pluginStatus.textContent = "Unknown";
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
