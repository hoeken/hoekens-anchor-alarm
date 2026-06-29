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
