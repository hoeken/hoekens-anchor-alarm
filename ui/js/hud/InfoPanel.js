// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { DisplayUnit } from "../DisplayUnit.js";

function formatClockTime(value) {
  const d = new Date(value);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export const InfoPanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "info leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "infoUI";
    container.innerHTML = `
        <table>
          <tr id="currentTideRow">
            <th><a href="/signalk-tides">Current&nbsp;Tide:</a></th>
            <td><span title="Current Tide" id='currentTide'>~</span></td>
          </tr>
          <tr id="highTideRow">
            <th>High&nbsp;Tide:</th>
            <td><span title="High Tide" id='highTide'>~</span></td>
          </tr>
          <tr id="lowTideRow">
            <th>Low&nbsp;Tide:</th>
            <td><span title="Low Tide" id='lowTide'>~</span></td>
          </tr>
          <tr>
            <th>Depth:</th>
            <td><span title="Depth" id='depthValue'>~</span></td>
          </tr>
          <tr>
            <th>Status:</th>
            <td><span id='pluginStatus'>Loading</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._depthValue = container.querySelector("#depthValue");
    this._currentTide = container.querySelector("#currentTide");
    this._currentTideRow = container.querySelector("#currentTideRow");
    this._tideHighTime = container.querySelector("#highTide");
    this._tideHighTimeRow = container.querySelector("#highTideRow");
    this._tideLowTime = container.querySelector("#lowTide");
    this._tideLowTimeRow = container.querySelector("#lowTideRow");
    this._pluginStatus = container.querySelector("#pluginStatus");
    return container;
  },

  update: function (state) {

    // InfoPanel only makes sense while anchored. ScopePanel is its raised
    // counterpart — the two are mutually exclusive in the bottom-right slot.
    if (!state.isAnchored()) {
      this.hide();
      return;
    }
    this.show();

    if (state.tide) {
      this.setCurrentTide(state.tide.heightNow);
      this.arrangeTideTimes(state.tide.timeHigh, state.tide.timeLow);
      this.setHighTime(state.tide.timeHigh);
      this.setLowTime(state.tide.timeLow);
    } else {
      this._currentTideRow.style.display = "none";
      this._tideHighTimeRow.style.display = "none";
      this._tideLowTimeRow.style.display = "none";
    }

    if (state.belowSurface)
      this.setDepthValue(state.belowSurface);
    else if (state.belowKeel)
      this.setDepthValue(state.belowKeel);
    else if (state.belowTransducer)
      this.setDepthValue(state.belowTransducer);
    else
      this.setDepthValue(null);
    this.setStatus(state.anchor.notification);
  },

  setCurrentTide: function (currentTide) {
    if (currentTide) {
      this._currentTide.textContent = DisplayUnit.formatDelta(currentTide);
      this._currentTideRow.style.display = "";
    } else {
      this._currentTideRow.style.display = "none";
    }
  },

  arrangeTideTimes: function (highTime, lowTime) {
    if (!highTime || !lowTime)
      return;
    const parent = this._tideHighTimeRow.parentNode;
    if (new Date(highTime.value) > new Date(lowTime.value))
      parent.insertBefore(this._tideLowTimeRow, this._tideHighTimeRow);
    else
      parent.insertBefore(this._tideHighTimeRow, this._tideLowTimeRow);
  },

  setHighTime: function (highTime) {
    if (highTime) {
      this._tideHighTime.textContent = formatClockTime(highTime.value);
      this._tideHighTimeRow.style.display = "";
    } else {
      this._tideHighTimeRow.style.display = "none";
    }
  },

  setLowTime: function (lowTime) {
    if (lowTime) {
      this._tideLowTime.textContent = formatClockTime(lowTime.value);
      this._tideLowTimeRow.style.display = "";
    } else {
      this._tideLowTimeRow.style.display = "none";
    }
  },

  setDepthValue: function (depth) {
    if (depth)
      this._depthValue.textContent = DisplayUnit.formatDelta(depth);
    else
      this._depthValue.textContent = "~";
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
