import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Geo, normalizeDegrees } from "../shared/geo.js";
import { ANCHOR, vesselAt } from "./helpers.js";

function closeTo(actual, expected, tol = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${actual} to be within ${tol} of ${expected}`,
  );
}

describe("normalizeDegrees()", () => {
  test("wraps into the [0, 360) range", () => {
    assert.equal(normalizeDegrees(0), 0);
    assert.equal(normalizeDegrees(360), 0);
    assert.equal(normalizeDegrees(450), 90);
    assert.equal(normalizeDegrees(-90), 270);
    assert.equal(normalizeDegrees(-450), 270);
  });
});

describe("Geo.bowPosition()", () => {
  test("returns the antenna position unchanged with zero offsets", () => {
    const bow = Geo.bowPosition(ANCHOR, 45, 0, 0);
    closeTo(bow.latitude, ANCHOR.latitude);
    closeTo(bow.longitude, ANCHOR.longitude);
  });

  test("moves the bow forward along the heading by yOffset", () => {
    // Heading north, antenna 10 m aft of the bow: the bow sits 10 m north.
    const bow = Geo.bowPosition(ANCHOR, 0, 0, 10);
    closeTo(Geo.distance(ANCHOR, bow), 10, 1e-3);
    closeTo(Geo.bearingTrue(ANCHOR, bow), 0, 1e-3);
  });

  test("offsets abeam by xOffset", () => {
    // Heading north, 5 m abeam: the bow shifts due west/east of the antenna.
    const bow = Geo.bowPosition(ANCHOR, 0, 5, 0);
    closeTo(Geo.distance(ANCHOR, bow), 5, 1e-3);
    const b = Geo.bearingTrue(ANCHOR, bow);
    assert.ok(Math.abs(b - 270) < 1e-2 || Math.abs(b - 90) < 1e-2, `abeam bearing ${b}`);
  });
});

describe("Geo.distance()", () => {
  test("matches the placement distance", () => {
    const vessel = vesselAt(ANCHOR, 55, 123);
    closeTo(Geo.distance(vessel, ANCHOR), 55, 1e-3);
  });
});

describe("Geo.bearingTrue()", () => {
  test("returns a compass azimuth in [0, 360)", () => {
    // Vessel due south of the anchor → anchor bears due north (0°).
    const vessel = vesselAt(ANCHOR, 40, 180);
    closeTo(Geo.bearingTrue(vessel, ANCHOR), 0, 1e-2);
    // Vessel due west → anchor bears due east (90°).
    const west = vesselAt(ANCHOR, 40, 270);
    closeTo(Geo.bearingTrue(west, ANCHOR), 90, 1e-2);
  });
});

describe("Geo.apparentBearing()", () => {
  test("is the true bearing relative to the heading, clockwise from the bow", () => {
    assert.equal(Geo.apparentBearing(0, 0), 0); // dead ahead
    assert.equal(Geo.apparentBearing(0, 90), 270); // off the port beam
    assert.equal(Geo.apparentBearing(90, 90), 0); // dead ahead again
    assert.equal(Geo.apparentBearing(180, 90), 90); // off the starboard beam
  });
});
