// Browser quirk detection for the engines this UI runs on. The Navico MFD
// embedded touchscreens use Chromium 69, which behaves differently from the
// modern desktop browsers we also target. Centralize the engine checks here so
// call sites stay readable; see the Chromium 69 notes in style.css for the
// related CSS workarounds.

// Chromium major version from the UA string, or null if this isn't a
// Chromium-based browser (Firefox, Safari, etc.).
const chromiumMajor = (() => {
  const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
})();

// On the Navico MFD engine (Chromium 69) native `title` tooltips pop up on touch
// and are positioned badly, covering the controls they label and interfering
// with the UI. Suppress them on that engine while keeping them for the regular
// desktop browsers, where hover tooltips behave as intended.
export const nativeTooltipsSuppressed =
  chromiumMajor !== null && chromiumMajor <= 69;

// Set an element's `title` (the native hover/long-press tooltip) unless native
// tooltips are suppressed on this engine. Use this instead of assigning
// `el.title` directly so the suppression decision lives in one place.
export function setTitle(el, title) {
  if (!nativeTooltipsSuppressed)
    el.title = title;
}

// Whether this webapp is running inside a Navico (Simrad/B&G/Lowrance) MFD's
// embedded browser. The signalk-navico-embedder plugin appends the console's
// device identity to the webapp URL as query params — `mfd_name` and
// `mfd_model_detail` — so their presence is a reliable marker that we're on an
// MFD rather than a regular desktop/tablet browser. Callers use this to apply
// MFD-only workarounds; see reverseScrollWheelZoom in AnchorAlarm, where the
// console's rotary/scroll input needs its zoom direction flipped.
export function isNavicoMfd() {
  const params = new URLSearchParams(window.location.search);
  return params.has("mfd_name") && params.has("mfd_model_detail");
}

// Whether this engine can run MapLibre GL, which powers the optional Seascape
// base layer (see SeascapeLoader). MapLibre needs a WebGL2 context and ES2019+
// JavaScript; the Chromium 69 MFD engine has neither reliably. The check is
// capability-based rather than UA-based so it also excludes any other old
// engine — where it returns false the Seascape layer simply never loads.
export function supportsMaplibre() {
  // Gate on the engine version, not runtime features: our reverse proxy
  // polyfills missing APIs (Object.fromEntries and friends), so a capability
  // probe passes even on the Chromium 69 MFDs — the polyfills mask the very
  // deficiency we'd be testing for — and WebGL2 reports as present there too.
  // MapLibre GL needs Chromium 73+ (its ES2019 baseline); below that, bail.
  if (chromiumMajor !== null && chromiumMajor < 73)
    return false;
  // For non-Chromium and newer engines, still require a live WebGL2 context
  // (e.g. it may be disabled or unavailable).
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
