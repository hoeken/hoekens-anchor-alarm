import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chartToLayerSpec, CHART_PANE } from "../ui/js/ChartLayers.js";

// The v2 charts catalog entry the plugin's TODO/issue #21 is modeled on: a
// SAS.Planet export served through @signalk/charts-plugin.
const FIJI = {
  identifier: "Fiji_Nanuku-Passage",
  name: "Unnamed map",
  description: "Created by SAS.Planet",
  bounds: [-180, -17.64402203, -178.2421875, -15.28418511],
  minzoom: 10,
  maxzoom: 17,
  format: "jpg",
  type: "tilelayer",
  scale: 250000,
  url: "/signalk/v1/api/resources/charts/Fiji_Nanuku-Passage/{z}/{x}/{y}",
  layers: [],
};

describe("chartToLayerSpec", () => {
  describe("XYZ raster charts", () => {
    test("maps the Fiji example to a tile-layer spec", () => {
      const spec = chartToLayerSpec(FIJI);
      assert.equal(spec.url, FIJI.url);
      assert.equal(spec.options.minZoom, 10);
      assert.equal(spec.options.maxNativeZoom, 17);
      assert.equal(spec.options.maxZoom, 23);
    });

    test("converts [W,S,E,N] bounds to Leaflet [[S,W],[N,E]]", () => {
      const spec = chartToLayerSpec(FIJI);
      assert.deepEqual(spec.options.bounds, [
        [-17.64402203, -180],
        [-15.28418511, -178.2421875],
      ]);
    });

    test("assigns the dedicated chart pane so it stays above the base and Seascape", () => {
      assert.equal(chartToLayerSpec(FIJI).options.pane, CHART_PANE);
    });

    test("accepts a missing type when the URL is a tile template", () => {
      const spec = chartToLayerSpec({ ...FIJI, type: undefined });
      assert.equal(spec.url, FIJI.url);
    });

    test("falls back to tilemapUrl when url is absent", () => {
      const { url, ...rest } = FIJI;
      const spec = chartToLayerSpec({ ...rest, tilemapUrl: url });
      assert.equal(spec.url, url);
    });

    test("passes through an attribution string when present", () => {
      const spec = chartToLayerSpec({ ...FIJI, attribution: "© Someone" });
      assert.equal(spec.options.attribution, "© Someone");
    });

    test("omits bounds/zoom options when the metadata is absent", () => {
      const spec = chartToLayerSpec({
        identifier: "bare",
        url: "/tiles/{z}/{x}/{y}.png",
      });
      assert.equal("bounds" in spec.options, false);
      assert.equal("minZoom" in spec.options, false);
      assert.equal("maxNativeZoom" in spec.options, false);
    });
  });

  describe("labeling", () => {
    test("uses the identifier when the name is the generic 'Unnamed map'", () => {
      assert.equal(chartToLayerSpec(FIJI).name, "Fiji_Nanuku-Passage");
    });

    test("prefers a meaningful name over the identifier", () => {
      const spec = chartToLayerSpec({ ...FIJI, name: "Nanuku Passage" });
      assert.equal(spec.name, "Nanuku Passage");
    });

    test("falls back to the identifier when the name is blank", () => {
      const spec = chartToLayerSpec({ ...FIJI, name: "   " });
      assert.equal(spec.name, "Fiji_Nanuku-Passage");
    });
  });

  describe("id (the per-user show/hide preference key)", () => {
    test("is the catalog identifier even when a display name exists", () => {
      const spec = chartToLayerSpec({ ...FIJI, name: "Nanuku Passage" });
      assert.equal(spec.id, "Fiji_Nanuku-Passage");
    });

    test("falls back to the label when the identifier is absent", () => {
      const chart = { ...FIJI, name: "Nanuku Passage" };
      delete chart.identifier;
      assert.equal(chartToLayerSpec(chart).id, "Nanuku Passage");
    });
  });

  describe("unsupported charts return null", () => {
    test("WMS charts", () => {
      assert.equal(chartToLayerSpec({ ...FIJI, type: "WMS" }), null);
    });

    test("vector-style charts", () => {
      assert.equal(chartToLayerSpec({ ...FIJI, type: "mapstyleJSON" }), null);
    });

    test("a URL that is not a tile template", () => {
      assert.equal(
        chartToLayerSpec({ ...FIJI, url: "/signalk/v1/api/resources/charts/x" }),
        null,
      );
    });

    test("a missing URL", () => {
      const chart = { ...FIJI };
      delete chart.url;
      assert.equal(chartToLayerSpec(chart), null);
    });

    test("null or non-object input", () => {
      assert.equal(chartToLayerSpec(null), null);
      assert.equal(chartToLayerSpec(undefined), null);
      assert.equal(chartToLayerSpec("nope"), null);
    });
  });
});
