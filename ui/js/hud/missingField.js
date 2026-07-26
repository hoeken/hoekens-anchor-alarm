// Write a formatted value into a HUD data-field span, with three states:
//
//   live     — the text, full strength
//   stale    — the text, dimmed (.stale): the reading is real but its source
//              has gone quiet, so it's last-known data, not live data
//   missing  — a dimmed placeholder (.missing): nothing to show at all.
//              DisplayUnit.format* returns "" for anything unformattable
//              (no envelope, null value, non-finite math), so panels funnel
//              every field through here instead of leaving it blank
//
// Both classes carry the muted styling — see style.css.

import { SignalKHelper } from "../SignalKHelper.js";

const MISSING_TEXT = "~";

// True when any of the envelopes backing a field has gone stale (no update
// within SignalKHelper's default freshness window). Derived fields pass the
// live inputs they're computed from; config-derived and prediction-driven
// fields pass nothing and never dim. A missing envelope is the missing
// state's problem, not staleness — it's skipped here.
export function fieldIsStale(envelopes, maxAge = undefined) {
  const list = Array.isArray(envelopes) ? envelopes : [envelopes];
  return list.some((e) => e && SignalKHelper.isStale(e, maxAge));
}

export function setFieldText(el, text, envelopes = null) {
  if (text) {
    el.textContent = text;
    el.classList.remove("missing");
    el.classList.toggle("stale", fieldIsStale(envelopes));
  } else {
    el.textContent = MISSING_TEXT;
    el.classList.add("missing");
    el.classList.remove("stale");
  }
}
