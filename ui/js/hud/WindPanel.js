// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import { radiansToDegrees } from "@turf/turf";
import { DisplayUnit } from "../DisplayUnit.js";
import { getWindBarb } from "../WindBarb.js";
import { setFieldText, fieldIsStale } from "./missingField.js";

export const WindPanel = L.Control.extend({
  options: { position: "bottomleft" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "windBarbControl leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "windBarbUI";
    container.style.display = "none";
    container.innerHTML = `
      <div><b>Wind</b></div>
      <div id="windBarbContainer"></div>
      <div id="awsValue"></div>
    `;
    this._container = container;
    this._aws = container.querySelector("#awsValue");
    this._barb = container.querySelector("#windBarbContainer");
    // The readout starts as the missing placeholder until data lands.
    this._lastAwsText = null;
    this._lastAwsStale = null;
    this._setAwsText("");
    this._lastBarbIcon = null;
    this._barbSvg = null;
    this._lastTransform = null;
    return container;
  },

  // Render the AWS readout via the shared missing-field treatment, skipping
  // the DOM write when nothing changed (this runs every update tick). The
  // skip key must include staleness, not just the text: a stalled feed is
  // exactly the case where the text stops changing while the dim state flips.
  _setAwsText: function (text, aws = null) {
    const stale = Boolean(text) && fieldIsStale(aws);
    if (text === this._lastAwsText && stale === this._lastAwsStale)
      return;
    setFieldText(this._aws, text, aws);
    this._lastAwsText = text;
    this._lastAwsStale = stale;
  },

  // Renders the AWS readout AND a fresh barb SVG. The SVG's rotation is set
  // from `twa` so that a setSpeed without a subsequent setAngle still points
  // the barb in the right direction.
  setSpeed: function (aws, twa) {
    if (!aws) {
      this._setAwsText("");
      return;
    }

    this._setAwsText(DisplayUnit.formatDelta(aws, 0), aws);

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
    if (!state.aws || !state.twa)
      this.hide();
    else {
      this.setSpeed(state.aws, state.twa);
      this.show();
    }
  },

  clearSpeed: function () {
    this._setAwsText("");
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
