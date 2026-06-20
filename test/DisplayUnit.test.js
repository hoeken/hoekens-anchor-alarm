import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DisplayUnit } from "../ui/js/DisplayUnit.js";

// Pin a known units profile so tests don't depend on the async loadActive()
// fetch that fires on import (it fails silently under Node and keeps a default).
before(() => {
  DisplayUnit.config = {
    categories: {
      speed: {
        formula: "value * 1.94384",
        inverseFormula: "value * 0.514444",
        symbol: "kn",
        displayFormat: "0.0",
      },
      temperature: {
        formula: "value - 273.15",
        symbol: "°C",
        displayFormat: "0.0",
      },
      angle: {
        formula: "value * 57.29577951308231",
        symbol: "°",
        displayFormat: "0.0",
      },
      heading: {
        targetUnit: "m",
        displayFormat: "0.0",
      },
    },
  };
});

describe("DisplayUnit.convertToDisplay()", () => {
  test("applies the formula and reports symbol + format", () => {
    const cfg = DisplayUnit.categoryConfig("speed");
    const { converted, symbol, format } = DisplayUnit.convertToDisplay(cfg, 10);
    assert.ok(Math.abs(converted - 19.4384) < 1e-6);
    assert.equal(symbol, "kn");
    assert.equal(format, "0.0");
  });

  test("passes the value through unchanged when there is no config", () => {
    assert.deepEqual(DisplayUnit.convertToDisplay(null, 5), {
      converted: 5,
      symbol: "",
      format: null,
    });
  });

  test("falls back to targetUnit when no explicit symbol", () => {
    const cfg = DisplayUnit.categoryConfig("heading");
    assert.equal(DisplayUnit.convertToDisplay(cfg, 1).symbol, "m");
  });
});

describe("DisplayUnit.convertFromDisplay()", () => {
  test("applies the inverse formula", () => {
    const cfg = DisplayUnit.categoryConfig("speed");
    assert.ok(Math.abs(DisplayUnit.convertFromDisplay(cfg, 10) - 5.14444) < 1e-6);
  });

  test("returns the value unchanged when there is no inverse formula", () => {
    assert.equal(DisplayUnit.convertFromDisplay(null, 7), 7);
  });
});

describe("DisplayUnit.formatFinal()", () => {
  test("uses the decimal count implied by the format", () => {
    assert.equal(DisplayUnit.formatFinal(19.4384, "kn", "0.0", false), "19.4 kn");
  });

  test("honors an explicit decimals override", () => {
    assert.equal(DisplayUnit.formatFinal(19.4384, "kn", "0.0", 2), "19.44 kn");
  });

  test("omits the space before a degree symbol", () => {
    assert.equal(DisplayUnit.formatFinal(45, "°", "0.0", false), "45.0°");
  });

  test("returns a bare string when there is no symbol", () => {
    assert.equal(DisplayUnit.formatFinal(12.3, "", "0.0", false), "12.3");
  });
});

describe("DisplayUnit.formatValue()", () => {
  test("converts and formats a value for a known category", () => {
    assert.equal(DisplayUnit.formatValue(10, "speed"), "19.4 kn");
  });

  test("returns empty string for null/undefined values", () => {
    assert.equal(DisplayUnit.formatValue(null, "speed"), "");
    assert.equal(DisplayUnit.formatValue(undefined, "speed"), "");
  });

  test("returns empty string for an unknown category", () => {
    assert.equal(DisplayUnit.formatValue(10, "nonsense"), "");
  });
});

describe("DisplayUnit.formatDelta()", () => {
  const delta = (value) => ({
    value,
    meta: { displayUnits: { category: "speed" } },
  });

  test("formats from the delta's meta category", () => {
    assert.equal(DisplayUnit.formatDelta(delta(10)), "19.4 kn");
  });

  test("returns empty string when value is missing", () => {
    assert.equal(DisplayUnit.formatDelta(delta(null)), "");
    assert.equal(DisplayUnit.formatDelta({ value: 10 }), "");
  });
});
