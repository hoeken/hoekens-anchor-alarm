import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CircleZone } from "../shared/watch-zones/index.js";
import { ANCHOR, vesselAt } from "./helpers.js";

describe("CircleZone", () => {
  describe("radius parsing", () => {
    test("uses the configured radius", () => {
      assert.equal(new CircleZone({ radius: 100 }).radius, 100);
    });

    test("coerces numeric strings", () => {
      assert.equal(new CircleZone({ radius: "85" }).radius, 85);
    });

    test("falls back to 60 m for missing, zero, negative, or junk radius", () => {
      assert.equal(new CircleZone({}).radius, 60);
      assert.equal(new CircleZone({ radius: 0 }).radius, 60);
      assert.equal(new CircleZone({ radius: -5 }).radius, 60);
      assert.equal(new CircleZone({ radius: "abc" }).radius, 60);
      assert.equal(new CircleZone({ radius: NaN }).radius, 60);
    });

    test("constructs with no config at all", () => {
      assert.equal(new CircleZone().radius, 60);
    });
  });

  describe("contains()", () => {
    const zone = new CircleZone({ radius: 60 });

    test("vessel well inside the radius is contained", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 50, 0), ANCHOR), true);
    });

    test("vessel beyond the radius is not contained", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 70, 0), ANCHOR), false);
    });

    test("distance check is direction-independent", () => {
      for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
        assert.equal(zone.contains(vesselAt(ANCHOR, 40, bearing), ANCHOR), true);
        assert.equal(zone.contains(vesselAt(ANCHOR, 90, bearing), ANCHOR), false);
      }
    });

    test("fails safe (contained) when a position is missing", () => {
      assert.equal(zone.contains(null, ANCHOR), true);
      assert.equal(zone.contains(vesselAt(ANCHOR, 200, 0), null), true);
      assert.equal(zone.contains(undefined, undefined), true);
    });
  });

  describe("getConfig()", () => {
    test("emits the type discriminator and radius", () => {
      assert.deepEqual(new CircleZone({ radius: 75 }).getConfig(), {
        type: "circle",
        radius: 75,
      });
    });
  });

  test("getCircleRadius() returns the radius", () => {
    assert.equal(new CircleZone({ radius: 42 }).getCircleRadius(), 42);
  });

  describe("getBoundingBox()", () => {
    test("brackets the anchor on all four sides", () => {
      const box = new CircleZone({ radius: 60 }).getBoundingBox(ANCHOR);
      assert.ok(box.latMax > ANCHOR.latitude);
      assert.ok(box.latMin < ANCHOR.latitude);
      assert.ok(box.lonMax > ANCHOR.longitude);
      assert.ok(box.lonMin < ANCHOR.longitude);
    });

    test("a bigger radius yields a wider box", () => {
      const small = new CircleZone({ radius: 30 }).getBoundingBox(ANCHOR);
      const big = new CircleZone({ radius: 120 }).getBoundingBox(ANCHOR);
      assert.ok(big.latMax > small.latMax);
      assert.ok(big.latMin < small.latMin);
    });
  });
});
