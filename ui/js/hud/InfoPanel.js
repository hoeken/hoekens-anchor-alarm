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

const TIDE_ARROW_UP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5"/></svg>`;
const TIDE_ARROW_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1"/></svg>`;

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
            <td><span title="Current Tide" id='currentTide'>~</span><span id='currentTideDirection'></span></td>
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
    this._currentTideDirection = container.querySelector("#currentTideDirection");
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
    if (!state.isAnchored() && state.belowSurface) {
      this.hide();
      return;
    }
    this.show();

    if (state.tide) {
      this.setCurrentTide(state.tide.heightNow, this.computeTideRising(state.tide));
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
    this.setStatus(state.anchor);
  },

  setCurrentTide: function (currentTide, rising) {
    if (currentTide) {
      this._currentTide.textContent = DisplayUnit.formatDelta(currentTide);
      if (rising === true)
        this._currentTideDirection.innerHTML = TIDE_ARROW_UP;
      else if (rising === false)
        this._currentTideDirection.innerHTML = TIDE_ARROW_DOWN;
      else
        this._currentTideDirection.innerHTML = "";
      this._currentTideRow.style.display = "";
    } else {
      this._currentTideRow.style.display = "none";
    }
  },

  computeTideRising: function (tide) {
    if (!tide.timeHigh || !tide.timeLow)
      return null;
    return new Date(tide.timeHigh.value) < new Date(tide.timeLow.value);
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
