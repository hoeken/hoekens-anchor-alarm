import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  watchZoneFromConfig,
  CircleZone,
  SectorZone,
  PolygonZone,
  WatchZone,
  SUPPORTED_ZONE_TYPES,
} from "../shared/watch-zones/index.js";

describe("watchZoneFromConfig()", () => {
  test("builds the right subclass for each supported type", () => {
    assert.ok(watchZoneFromConfig({ type: "circle" }) instanceof CircleZone);
    assert.ok(watchZoneFromConfig({ type: "sector" }) instanceof SectorZone);
    assert.ok(watchZoneFromConfig({ type: "polygon" }) instanceof PolygonZone);
  });

  test("defaults to a circle for missing/empty/non-object config", () => {
    assert.ok(watchZoneFromConfig({}) instanceof CircleZone);
    assert.ok(watchZoneFromConfig({ type: undefined }) instanceof CircleZone);
    assert.ok(watchZoneFromConfig({ type: null }) instanceof CircleZone);
    assert.ok(watchZoneFromConfig(null) instanceof CircleZone);
    assert.ok(watchZoneFromConfig(undefined) instanceof CircleZone);
    assert.ok(watchZoneFromConfig("garbage") instanceof CircleZone);
  });

  test("throws on an unknown type rather than guessing", () => {
    assert.throws(() => watchZoneFromConfig({ type: "triangle" }), /Unknown watch zone type/);
  });

  test("round-trips every produced zone through its own getConfig()", () => {
    for (const type of SUPPORTED_ZONE_TYPES) {
      const zone = watchZoneFromConfig({ type });
      const rebuilt = watchZoneFromConfig(zone.getConfig());
      assert.equal(rebuilt.getType(), type);
    }
  });
});

describe("WatchZone (abstract base)", () => {
  // Minimal subclass that inherits every base method without overriding, so we
  // can prove the base contract throws "must implement" for the abstract bits.
  class BareZone extends WatchZone {}

  test("cannot be instantiated directly", () => {
    assert.throws(() => new WatchZone(), /abstract/);
  });

  test("abstract methods throw until a subclass overrides them", () => {
    const zone = new BareZone();
    assert.throws(() => zone.getType(), /must implement getType/);
    assert.throws(() => zone.getConfig(), /must implement getConfig/);
    assert.throws(() => zone.contains(), /must implement contains/);
    assert.throws(() => zone.getBoundingBox(), /must implement getBoundingBox/);
  });

  test("getCircleRadius() defaults to null", () => {
    assert.equal(new BareZone().getCircleRadius(), null);
  });
});
