// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { SignalKHelper } from "../SignalKHelper";

export const InfoPanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "info leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "infoUI";
    container.innerHTML = `
        <table>
          <tr>
            <th>Depth:</th>
            <td><span title="Below Surface" id='belowSurface'>~</span></td>
          </tr>
          <tr>
            <th>Status:</th>
            <td><span id='pluginStatus'>Loading</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._belowSurface = container.querySelector("#belowSurface");
    this._pluginStatus = container.querySelector("#pluginStatus");
    return container;
  },

  update: function (state) {
    this.setBelowSurface(state.belowSurface);
    this.setStatus(state.anchor.notification);
  },

  setBelowSurface: function (dbs) {
    if (dbs)
      this._belowSurface.textContent = SignalKHelper.formatDisplay(dbs);
    else
      this._belowSurface.textContent = "~";
  },

  setStatus: function (notification) {
    if (notification) {
      this._pluginStatus.textContent = notification.value.message;
      this._pluginStatus.className = "";
      if (notification.value.message !== "Off" && notification.value.state) {
        this._pluginStatus.classList.add(notification.value.state);
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
