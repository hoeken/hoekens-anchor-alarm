// SignalK can serve local raster charts (MBTiles, SAS.Planet exports, etc.)
// through its resources API. This module fetches the chart catalog from
// /signalk/v2/api/resources/charts and turns each raster chart into a Leaflet
// tile layer the app adds to the layer control as a toggleable overlay — so a
// detailed local chart draws on top of the satellite/OSM base within its
// bounds, while the base still fills the map everywhere else.
//
// Only XYZ raster charts (type "tilelayer") are handled. WMS charts and vector
// styles (mapstyleJSON, which would need a WebGL renderer — see SeascapeLoader)
// are skipped. loadChartLayers never rejects: a missing charts plugin, an auth
// error, or an unsupported chart just yields fewer (or zero) layers, never a
// broken startup. Unlike Seascape it needs no special engine support, so local
// charts also work on the Chromium 69 MFDs.

// Chart overlays sit above the base tile layers but below the anchor overlay
// and vessel markers (those live in higher Leaflet panes). An explicit z-index
// keeps a chart on top of the base even after the user switches base maps —
// which re-inserts the base layer's tiles later in the tile pane's DOM and
// would otherwise cover an active chart.
const CHART_OVERLAY_Z_INDEX = 300;

// SAS.Planet and similar tools export charts with a literal "Unnamed map" name;
// in that case the identifier ("Fiji_Nanuku-Passage") is the more useful label
// for the layer control.
function chartLabel(chart) {
  const name = typeof chart.name === "string" ? chart.name.trim() : "";
  if (name && name !== "Unnamed map")
    return name;
  return chart.identifier || name || "Chart";
}

// Convert a v2 charts catalog entry into a Leaflet tile-layer spec
// ({ name, url, options }), or null when the chart isn't an XYZ raster layer we
// can render. Kept free of any `L` reference so it's unit-testable without
// Leaflet.
export function chartToLayerSpec(chart) {
  if (!chart || typeof chart !== "object")
    return null;

  // Only XYZ raster tile layers are supported. WMS and vector-style charts are
  // skipped; a missing type is tolerated as long as the URL is a tile template.
  if (chart.type && chart.type !== "tilelayer")
    return null;

  // v2 exposes the tile template as `url`; older shapes used `tilemapUrl`.
  const url = chart.url || chart.tilemapUrl;
  if (!url || !url.includes("{z}"))
    return null;

  const options = { zIndex: CHART_OVERLAY_Z_INDEX };

  // bounds is [west, south, east, north]; Leaflet wants [[S, W], [N, E]].
  // Bounding the layer stops it requesting (404) tiles outside the coverage.
  if (Array.isArray(chart.bounds) && chart.bounds.length === 4) {
    const [w, s, e, n] = chart.bounds;
    options.bounds = [[s, w], [n, e]];
  }
  if (Number.isFinite(chart.minzoom))
    options.minZoom = chart.minzoom;
  if (Number.isFinite(chart.maxzoom)) {
    // Cap real tile requests at the chart's max, but let Leaflet upscale those
    // tiles when the user zooms in tighter, instead of blanking the layer.
    options.maxNativeZoom = chart.maxzoom;
    options.maxZoom = 23;
  }
  if (typeof chart.attribution === "string" && chart.attribution)
    options.attribution = chart.attribution;

  return { name: chartLabel(chart), url, options };
}

// Fetch the chart catalog and build a Leaflet tile layer for each raster chart.
// Resolves to an array of { name, layer }; never rejects.
export function loadChartLayers(signalK) {
  return signalK
    .fetchCharts()
    .then((charts) => {
      if (!charts || typeof charts !== "object")
        return [];
      const layers = [];
      for (const chart of Object.values(charts)) {
        const spec = chartToLayerSpec(chart);
        if (!spec)
          continue;
        layers.push({ name: spec.name, layer: L.tileLayer(spec.url, spec.options) });
      }
      return layers;
    })
    .catch((error) => {
      console.warn("Local charts unavailable:", error);
      return [];
    });
}
