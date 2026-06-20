import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SectorZone } from "../shared/watch-zones/index.js";
import { ANCHOR, vesselAt } from "./helpers.js";

describe("SectorZone", () => {
  describe("config parsing", () => {
    test("keeps configured radius and angles", () => {
      const zone = new SectorZone({ radius: 100, startAngle: 30, endAngle: 150 });
      assert.equal(zone.radius, 100);
      assert.equal(zone.startAngle, 30);
      assert.equal(zone.endAngle, 150);
    });

    test("normalizes angles into 0–360 via azimuth", () => {
      const zone = new SectorZone({ radius: 60, startAngle: -45, endAngle: 420 });
      assert.equal(zone.startAngle, 315);
      assert.equal(zone.endAngle, 60);
    });

    test("falls back to defaults for missing radius and angles", () => {
      const zone = new SectorZone({});
      assert.equal(zone.radius, 60);
      assert.equal(zone.startAngle, 300);
      assert.equal(zone.endAngle, 60);
    });
  });

  describe("contains() — simple arc (start 0°, end 90°)", () => {
    const zone = new SectorZone({ radius: 60, startAngle: 0, endAngle: 90 });

    test("inside the arc and inside the radius", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 40, 45), ANCHOR), true);
    });

    test("inside the radius but outside the arc", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 40, 180), ANCHOR), false);
      assert.equal(zone.contains(vesselAt(ANCHOR, 40, 270), ANCHOR), false);
    });

    test("inside the arc but beyond the radius", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 90, 45), ANCHOR), false);
    });
  });

  describe("contains() — arc wrapping past north (start 300°, end 60°)", () => {
    const zone = new SectorZone({ radius: 60, startAngle: 300, endAngle: 60 });

    test("due north (0°) is inside the wrapped arc", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 40, 0), ANCHOR), true);
    });

    test("due south (180°) is outside the wrapped arc", () => {
      assert.equal(zone.contains(vesselAt(ANCHOR, 40, 180), ANCHOR), false);
    });
  });

  test("fails safe (contained) when a position is missing", () => {
    const zone = new SectorZone({ radius: 60, startAngle: 0, endAngle: 90 });
    assert.equal(zone.contains(null, ANCHOR), true);
    assert.equal(zone.contains(vesselAt(ANCHOR, 40, 180), null), true);
  });

  describe("getConfig()", () => {
    test("round-trips to an equivalent zone", () => {
      const zone = new SectorZone({ radius: 80, startAngle: 10, endAngle: 200 });
      assert.deepEqual(zone.getConfig(), {
        type: "sector",
        radius: 80,
        startAngle: 10,
        endAngle: 200,
      });
    });
  });

  test("getCircleRadius() reports the outer radius", () => {
    assert.equal(new SectorZone({ radius: 95 }).getCircleRadius(), 95);
  });
});
