import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseScopes, formatScopeRatio, DEFAULT_SCOPES } from "../shared/scopes.js";

describe("parseScopes()", () => {
  test("parses a clean comma-separated string", () => {
    assert.deepEqual(parseScopes("7,5,4,3"), [7, 5, 4, 3]);
  });

  test("sorts highest to lowest regardless of input order", () => {
    assert.deepEqual(parseScopes("3,7,4,5"), [7, 5, 4, 3]);
  });

  test("tolerates whitespace around values", () => {
    assert.deepEqual(parseScopes(" 7 , 5 ,4 "), [7, 5, 4]);
  });

  test("keeps valid numbers and discards invalid tokens", () => {
    assert.deepEqual(parseScopes("7,banana,5,,4"), [7, 5, 4]);
  });

  test("drops values outside the 1–10 range", () => {
    assert.deepEqual(parseScopes("0,7,11,-2,5,10,1"), [10, 7, 5, 1]);
  });

  test("keeps the inclusive bounds 1 and 10", () => {
    assert.deepEqual(parseScopes("1,10"), [10, 1]);
  });

  test("supports decimal ratios", () => {
    assert.deepEqual(parseScopes("7,3.5"), [7, 3.5]);
  });

  test("collapses duplicates", () => {
    assert.deepEqual(parseScopes("7,7,5,5,4"), [7, 5, 4]);
  });

  test("falls back to defaults when nothing is usable", () => {
    for (const input of ["", "abc,xyz", "0,11", "  ", ",,,", undefined, null, 42])
      assert.deepEqual(parseScopes(input), DEFAULT_SCOPES);
  });

  test("returns a fresh array so the defaults can't be mutated", () => {
    const a = parseScopes("");
    a.push(99);
    assert.deepEqual(parseScopes(""), DEFAULT_SCOPES);
  });

  test("accepts an array as input", () => {
    assert.deepEqual(parseScopes([3, 5, 7, 12, "x"]), [7, 5, 3]);
  });

  test("honors a custom fallback", () => {
    assert.deepEqual(parseScopes("nope", [6, 2]), [6, 2]);
  });
});

describe("formatScopeRatio()", () => {
  test("renders whole numbers without decimals", () => {
    assert.equal(formatScopeRatio(7), "7");
    assert.equal(formatScopeRatio(7.0), "7");
    assert.equal(formatScopeRatio(10), "10");
  });

  test("renders one decimal place for fractional ratios", () => {
    assert.equal(formatScopeRatio(3.5), "3.5");
  });

  test("rounds to a single decimal place", () => {
    assert.equal(formatScopeRatio(3.523), "3.5");
    assert.equal(formatScopeRatio(3.55), "3.6");
  });

  test("promotes to a whole number when rounding lands there", () => {
    assert.equal(formatScopeRatio(6.98), "7");
  });
});
