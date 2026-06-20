import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PolygonZone } from "../shared/watch-zones/index.js";
import {
  MIN_VERTICES,
  MAX_VERTICES,
  verticesAreSimple,
} from "../shared/watch-zones/PolygonZone.js";
import { ANCHOR, vesselAt } from "./helpers.js";

// A square centred on the anchor: corners 70 m out on the diagonals, so each
// edge sits ~49.5 m from the anchor along the cardinal axes.
const SQUARE = [
  { bearing: 45, distance: 70 },
  { bearing: 135, distance: 70 },
  { bearing: 225, distance: 70 },
  { bearing: 315, distance: 70 },
];

describe("PolygonZone", () => {
  describe("vertex sanitizing", () => {
    test("keeps valid vertices and normalizes bearings", () => {
      const zone = new PolygonZone({
        vertices: [{ bearing: -10, distance: 50 }],
      });
      assert.deepEqual(zone.vertices, [{ bearing: 350, distance: 50 }]);
    });

    test("drops vertices with junk, missing, or non-positive distance", () => {
      const zone = new PolygonZone({
        vertices: [
          { bearing: 0, distance: 50 },
          { bearing: 90, distance: 0 },
          { bearing: 180, distance: -5 },
          { bearing: NaN, distance: 50 },
          { distance: 50 },
          null,
        ],
      });
      assert.deepEqual(zone.vertices, [{ bearing: 0, distance: 50 }]);
    });

    test("ignores a non-array vertices field", () => {
      assert.deepEqual(new PolygonZone({ vertices: "nope" }).vertices, []);
      assert.deepEqual(new PolygonZone({}).vertices, []);
    });

    test("caps the vertex count at MAX_VERTICES", () => {
      const many = Array.from({ length: MAX_VERTICES + 10 }, (_, i) => ({
        bearing: i,
        distance: 50,
      }));
      assert.equal(new PolygonZone({ vertices: many }).vertices.length, MAX_VERTICES);
    });
  });

  describe("contains()", () => {
    test("a finished polygon contains an interior point", () => {
      const zone = new PolygonZone({ vertices: SQUARE });
      assert.equal(zone.contains(vesselAt(ANCHOR, 40, 0), ANCHOR), true);
    });

    test("a finished polygon excludes an exterior point", () => {
      const zone = new PolygonZone({ vertices: SQUARE });
      assert.equal(zone.contains(vesselAt(ANCHOR, 65, 0), ANCHOR), false);
    });

    test("a degenerate (<3 vertex) zone is treated as open", () => {
      const zone = new PolygonZone({
        vertices: [
          { bearing: 0, distance: 50 },
          { bearing: 90, distance: 50 },
        ],
      });
      assert.ok(zone.vertices.length < MIN_VERTICES);
      assert.equal(zone.contains(vesselAt(ANCHOR, 5000, 0), ANCHOR), true);
    });

    test("fails safe (contained) when a position is missing", () => {
      const zone = new PolygonZone({ vertices: SQUARE });
      assert.equal(zone.contains(null, ANCHOR), true);
      assert.equal(zone.contains(vesselAt(ANCHOR, 65, 0), null), true);
    });
  });

  describe("getCircleRadius()", () => {
    test("reports the farthest vertex as a conservative outer bound", () => {
      const zone = new PolygonZone({
        vertices: [
          { bearing: 0, distance: 30 },
          { bearing: 120, distance: 80 },
          { bearing: 240, distance: 55 },
        ],
      });
      assert.equal(zone.getCircleRadius(), 80);
    });

    test("is 0 with no vertices", () => {
      assert.equal(new PolygonZone({}).getCircleRadius(), 0);
    });
  });

  describe("getConfig()", () => {
    test("round-trips through the factory to equal vertices", () => {
      const zone = new PolygonZone({ vertices: SQUARE });
      const rebuilt = new PolygonZone(zone.getConfig());
      assert.equal(zone.getConfig().type, "polygon");
      assert.deepEqual(rebuilt.vertices, zone.vertices);
    });
  });

  describe("verticesAreSimple()", () => {
    test("true for a non-self-intersecting square", () => {
      assert.equal(verticesAreSimple(SQUARE), true);
    });

    test("false for a self-intersecting bowtie", () => {
      const bowtie = [
        { bearing: 45, distance: 70 },
        { bearing: 225, distance: 70 },
        { bearing: 135, distance: 70 },
        { bearing: 315, distance: 70 },
      ];
      assert.equal(verticesAreSimple(bowtie), false);
    });

    test("false for fewer than MIN_VERTICES", () => {
      assert.equal(verticesAreSimple(SQUARE.slice(0, 2)), false);
      assert.equal(verticesAreSimple("nope"), false);
    });
  });

  describe("getBoundingBox()", () => {
    test("brackets the anchor for a finished polygon", () => {
      const box = new PolygonZone({ vertices: SQUARE }).getBoundingBox(ANCHOR);
      assert.ok(box.latMax > ANCHOR.latitude);
      assert.ok(box.latMin < ANCHOR.latitude);
      assert.ok(box.lonMax > ANCHOR.longitude);
      assert.ok(box.lonMin < ANCHOR.longitude);
    });

    test("collapses to the anchor point when there are no vertices", () => {
      const box = new PolygonZone({}).getBoundingBox(ANCHOR);
      assert.deepEqual(box, {
        latMin: ANCHOR.latitude,
        latMax: ANCHOR.latitude,
        lonMin: ANCHOR.longitude,
        lonMax: ANCHOR.longitude,
      });
    });
  });
});
