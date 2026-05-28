// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

import * as d3 from "d3";
import { DisplayUnit } from "../DisplayUnit.js";
import { GeoMath } from "../GeoMath.js";

const TIDES_HREF = "/signalk-tides/";
const HOURS_BEFORE_NOW = 1;
const HOURS_AFTER_LAST_TIDE = 3;
const MAX_WINDOW_HOURS = 24;
const CURVE_SAMPLES = 120;

function formatClockTime(value) {
  const d = new Date(value);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

function formatHeight(envelope) {
  return envelope ? DisplayUnit.formatDelta(envelope) : "";
}

export const TidePanel = L.Control.extend({
  options: { position: "bottomright" },

  onAdd: function () {
    const container = L.DomUtil.create("div", "tides leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "tidesUI";
    container.title = "View tides";
    container.style.cursor = "pointer";
    container.style.display = "none";
    L.DomEvent.on(container, "click", () => {
      window.location.href = TIDES_HREF;
    });

    this._container = container;
    this._svg = d3.select(container).append("svg").attr("class", "tides-svg");

    const defs = this._svg.append("defs");
    const grad = defs.append("linearGradient")
      .attr("id", "tidesGradient")
      .attr("gradientTransform", "rotate(90)");
    grad.append("stop").attr("class", "tides-gradient-stop1").attr("offset", "0");
    grad.append("stop").attr("class", "tides-gradient-stop2").attr("offset", "100%");

    this._areaPath = this._svg.append("path").attr("class", "tides-area").attr("fill", "url(#tidesGradient)");
    this._linePath = this._svg.append("path").attr("class", "tides-line").attr("fill", "none");
    this._nowLine = this._svg.append("line").attr("class", "tides-now");
    this._nowLabel = this._svg.append("text").attr("class", "tides-now-label");
    this._markers = this._svg.append("g").attr("class", "tides-markers");

    this._resizeObserver = new ResizeObserver(() => this._render());
    this._resizeObserver.observe(container);

    return container;
  },

  onRemove: function () {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  },

  update: function (state) {
    const tide = state.tide;
    if (
      !tide ||
      !tide.timeLow || !tide.heightLow ||
      !tide.timeHigh || !tide.heightHigh
    ) {
      this.hide();
      return;
    }
    this.show();
    this._tide = tide;
    this._render();
  },

  _render: function () {
    const tide = this._tide;
    if (!tide || !this._container)
      return;

    const width = this._container.clientWidth;
    const height = this._container.clientHeight;
    if (!width || !height)
      return;

    const marginTop = 16;
    const marginBottom = 4;
    const marginLeft = 4;
    const marginRight = 4;

    this._svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

    const lowTimeMs = new Date(tide.timeLow.value).getTime();
    const lowHeight = tide.heightLow.value;
    const highTimeMs = new Date(tide.timeHigh.value).getTime();
    const highHeight = tide.heightHigh.value;

    const now = new Date();
    const nowMs = now.getTime();
    const startMs = nowMs - HOURS_BEFORE_NOW * 3600 * 1000;
    const lastTideMs = Math.max(lowTimeMs, highTimeMs);
    const desiredEndMs = lastTideMs + HOURS_AFTER_LAST_TIDE * 3600 * 1000;
    const maxEndMs = startMs + MAX_WINDOW_HOURS * 3600 * 1000;
    const endMs = Math.min(desiredEndMs, maxEndMs);

    const data = d3.range(CURVE_SAMPLES + 1).map((i) => {
      const t = startMs + (i / CURVE_SAMPLES) * (endMs - startMs);
      return {
        time: t,
        level: GeoMath.estimateTideHeightSmooth(lowTimeMs, lowHeight, highTimeMs, highHeight, t),
      };
    });

    const xScale = d3.scaleTime()
      .domain([startMs, endMs])
      .range([marginLeft, width - marginRight]);

    const [dMin, dMax] = d3.extent(data, (d) => d.level);
    const yMin = Math.min(dMin, lowHeight);
    const yMax = Math.max(dMax, highHeight);
    const yPad = Math.max(0.05, (yMax - yMin) * 0.25);

    const yScale = d3.scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([height - marginBottom, marginTop]);

    const areaGen = d3.area()
      .curve(d3.curveMonotoneX)
      .x((d) => xScale(d.time))
      .y0(yScale(yMin - yPad))
      .y1((d) => yScale(d.level));

    const lineGen = d3.line()
      .curve(d3.curveMonotoneX)
      .x((d) => xScale(d.time))
      .y((d) => yScale(d.level));

    this._areaPath.datum(data).attr("d", areaGen);
    this._linePath.datum(data).attr("d", lineGen);

    this._nowLine
      .attr("x1", xScale(nowMs))
      .attr("x2", xScale(nowMs))
      .attr("y1", marginTop)
      .attr("y2", height - marginBottom);

    const nowText = `${formatClockTime(now)} ${formatHeight(tide.heightNow)}`.trim();
    this._nowLabel
      .attr("x", marginLeft)
      .attr("y", marginTop - 4)
      .attr("text-anchor", "start")
      .text(nowText);

    const extremes = [];
    if (lowTimeMs >= startMs && lowTimeMs <= endMs)
      extremes.push({ time: lowTimeMs, height: lowHeight, envelope: tide.heightLow, label: "low" });
    if (highTimeMs >= startMs && highTimeMs <= endMs)
      extremes.push({ time: highTimeMs, height: highHeight, envelope: tide.heightHigh, label: "high" });

    const join = this._markers.selectAll("g.tides-marker").data(extremes, (d) => d.label);
    join.exit().remove();
    const enter = join.enter().append("g").attr("class", (d) => `tides-marker tides-marker--${d.label}`);
    enter.append("circle").attr("class", "tides-marker-dot").attr("r", 2.5);
    enter.append("text").attr("class", "tides-marker-height");
    enter.append("text").attr("class", "tides-marker-time");

    const merged = enter.merge(join);
    merged.select("circle.tides-marker-dot")
      .attr("cx", (d) => xScale(d.time))
      .attr("cy", (d) => yScale(d.height));

    const clampX = (x) => Math.max(marginLeft + 2, Math.min(width - marginRight - 2, x));

    merged.select("text.tides-marker-height")
      .attr("x", (d) => clampX(xScale(d.time)))
      .attr("y", (d) => d.label === "high" ? yScale(d.height) + 14 : yScale(d.height) - 6)
      .attr("text-anchor", "middle")
      .text((d) => formatHeight(d.envelope));

    merged.select("text.tides-marker-time")
      .attr("x", (d) => clampX(xScale(d.time)))
      .attr("y", (d) => d.label === "high" ? yScale(d.height) + 26 : yScale(d.height) - 18)
      .attr("text-anchor", "middle")
      .text((d) => formatClockTime(d.time));
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
