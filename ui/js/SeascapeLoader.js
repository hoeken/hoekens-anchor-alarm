// Seascape (openwaters.io) publishes its nautical chart only as a MapLibre GL
// vector style — there is no plain raster tile URL to drop into L.tileLayer like
// the OSM and satellite layers. Rendering it in Leaflet means the maplibre-gl-
// leaflet binding on top of MapLibre GL, a ~1 MB WebGL renderer that older MFD
// engines can't run (see supportsMaplibre). So MapLibre is vendored under
// public/maplibre/ but kept out of index.html: we inject the scripts at runtime
// and only on capable engines, keeping them entirely off the Chromium 69 path.
//
// loadSeascapeLayer resolves to a ready-to-add L.maplibreGL base layer, or null
// when the engine is unsupported or a script fails to load. It never rejects, so
// callers can treat a null result as "Seascape isn't available here."

import { supportsMaplibre } from "./BrowserSupport.js";

const SEASCAPE_STYLE = "https://tiles.openwaters.io/seascape/style.json";
const SEASCAPE_ATTRIBUTION =
  'Bathymetry &copy; <a href="https://openwaters.io/charts/seascape#license">Open Water Software, LLC</a>';

// Memoized load: a config re-render or repeated init should reuse the one load
// rather than injecting the scripts again.
let layerPromise = null;

function injectStylesheet(href) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function loadSeascapeLayer() {
  if (layerPromise)
    return layerPromise;

  if (!supportsMaplibre()) {
    layerPromise = Promise.resolve(null);
    return layerPromise;
  }

  injectStylesheet("maplibre/maplibre-gl.css");
  // maplibre-gl defines the global `maplibregl`; the Leaflet binding reads it at
  // load time and extends the global `L`, so the two must load in this order.
  layerPromise = injectScript("maplibre/maplibre-gl.js")
    .then(() => injectScript("maplibre/leaflet-maplibre-gl.js"))
    .then(() => {
      if (typeof L === "undefined" || typeof L.maplibreGL !== "function")
        return null;
      // interactive:false leaves pan/zoom to Leaflet; the GL canvas only draws.
      // The plugin's getAttribution ignores the plain `attribution` option — it
      // reads attributionControl.customAttribution (or else auto-gathers from
      // the style only after the GL map loads, which our #mapAttribution strip
      // wouldn't catch). Pass the license-required credit here so it shows the
      // moment the layer is active. The plugin force-disables MapLibre's own
      // on-canvas control, so there's no duplicate.
      return L.maplibreGL({
        style: SEASCAPE_STYLE,
        interactive: false,
        attributionControl: { customAttribution: SEASCAPE_ATTRIBUTION },
      });
    })
    .catch((error) => {
      console.warn("Seascape layer unavailable:", error);
      return null;
    });

  return layerPromise;
}
