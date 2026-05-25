// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { radiansToDegrees } from "@turf/turf";
import { DisplayUnit } from "../DisplayUnit.js";
import { getWindBarb } from "../WindBarb.js";

export const WindPanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "windBarbControl leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "windBarbUI";
    container.innerHTML = `
      <div><b>Wind</b></div>
      <div id="windBarbContainer"></div>
      <div id="awsValue">~</div>
    `;
    this._container = container;
    this._aws = container.querySelector("#awsValue");
    this._barb = container.querySelector("#windBarbContainer");
    this._lastAwsText = "~";
    this._lastBarbIcon = null;
    this._barbSvg = null;
    this._lastTransform = null;
    return container;
  },

  // Renders the AWS readout AND a fresh barb SVG. The SVG's rotation is set
  // from `twa` so that a setSpeed without a subsequent setAngle still points
  // the barb in the right direction.
  setSpeed: function (aws, twa) {
    if (!aws) {
      if (this._lastAwsText !== "~") {
        this._aws.innerHTML = "~";
        this._lastAwsText = "~";
      }
      return;
    }

    const awsText = DisplayUnit.formatDelta(aws, 0);
    if (awsText !== this._lastAwsText) {
      this._aws.innerHTML = awsText;
      this._lastAwsText = awsText;
    }

    const windBarbIcon = getWindBarb(aws.value);
    if (windBarbIcon !== this._lastBarbIcon) {
      this._barb.innerHTML = windBarbIcon;
      this._barbSvg = this._barb.querySelector("svg");
      this._lastBarbIcon = windBarbIcon;
      this._lastTransform = null;
    }
    if (this._barbSvg) {
      let angle = 0;
      if (twa)
        angle = Math.round(radiansToDegrees(twa.value));
      const transform = `rotate(${angle}deg)`;
      if (transform !== this._lastTransform) {
        this._barbSvg.style.transform = transform;
        this._lastTransform = transform;
      }
    }
  },

  // Re-rotates the existing barb SVG. No-op if setSpeed hasn't rendered one yet.
  setAngle: function (twa) {
    if (!twa || !this._barbSvg)
      return;

    const angle = Math.round(radiansToDegrees(twa.value));
    const transform = `rotate(${angle}deg)`;
    if (transform !== this._lastTransform) {
      this._barbSvg.style.transform = transform;
      this._lastTransform = transform;
    }
  },

  update: function (state) {
    //if we don't have the right data, hide ourself.
    if (!state.aws && !state.twa)
      this.hide();
    else
      this.setSpeed(state.aws, state.twa);
  },

  clearSpeed: function () {
    if (this._lastAwsText !== "~") {
      this._aws.innerHTML = "~";
      this._lastAwsText = "~";
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
