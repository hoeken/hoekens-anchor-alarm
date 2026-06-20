import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GeoMath } from "../ui/js/GeoMath.js";

const { estimateTideHeightSmooth } = GeoMath;

// Times as epoch-ms for clarity. A 6-hour half-tide; heights in meters.
const H = 6 * 3600 * 1000;

function closeTo(actual, expected, tol = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${actual} to be within ${tol} of ${expected}`,
  );
}

describe("GeoMath.estimateTideHeightSmooth()", () => {
  describe("rising tide (low → high)", () => {
    const args = [0, 0, H, 2]; // low 0 m at t=0, high 2 m at t=6h

    test("returns the low height at the low-tide time", () => {
      closeTo(estimateTideHeightSmooth(...args, 0), 0);
    });

    test("returns the high height at the high-tide time", () => {
      closeTo(estimateTideHeightSmooth(...args, H), 2);
    });

    test("returns the mean height at the midpoint", () => {
      closeTo(estimateTideHeightSmooth(...args, H / 2), 1);
    });

    test("rises monotonically across the interval", () => {
      const q1 = estimateTideHeightSmooth(...args, H / 4);
      const mid = estimateTideHeightSmooth(...args, H / 2);
      const q3 = estimateTideHeightSmooth(...args, (3 * H) / 4);
      assert.ok(q1 < mid && mid < q3);
    });
  });

  describe("falling tide (high → low)", () => {
    const args = [H, 0, 0, 2]; // low 0 m at t=6h, high 2 m at t=0

    test("returns the high height at the high-tide time", () => {
      closeTo(estimateTideHeightSmooth(...args, 0), 2);
    });

    test("returns the low height at the low-tide time", () => {
      closeTo(estimateTideHeightSmooth(...args, H), 0);
    });

    test("falls monotonically across the interval", () => {
      const q1 = estimateTideHeightSmooth(...args, H / 4);
      const mid = estimateTideHeightSmooth(...args, H / 2);
      const q3 = estimateTideHeightSmooth(...args, (3 * H) / 4);
      assert.ok(q1 > mid && mid > q3);
    });
  });

  test("accepts Date and ISO-string inputs, not just numbers", () => {
    const fromNumbers = estimateTideHeightSmooth(0, 0, H, 2, H / 2);
    const fromDates = estimateTideHeightSmooth(
      new Date(0),
      0,
      new Date(H),
      2,
      new Date(H / 2),
    );
    const fromStrings = estimateTideHeightSmooth(
      new Date(0).toISOString(),
      0,
      new Date(H).toISOString(),
      2,
      new Date(H / 2).toISOString(),
    );
    closeTo(fromDates, fromNumbers);
    closeTo(fromStrings, fromNumbers);
  });
});
