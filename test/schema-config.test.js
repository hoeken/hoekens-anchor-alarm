import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  migrateConfig,
  readZoneConfig,
  pickUiConfig,
  coerceUiConfig,
  applyDefaults,
  UI_CONFIG_KEYS,
} from "../src/schema.js";
import { ValidationError } from "../src/errors.js";

// buildSchema(app) only ever calls app.getSelfPath() to mark path checks, so a
// stub that reports every path as absent is enough for coercion/defaults tests.
const APP = { getSelfPath: () => null };

describe("migrateConfig()", () => {
  test("upgrades a legacy top-level radius into a circle zone string", () => {
    const config = { radius: 50 };
    assert.equal(migrateConfig(config), true);
    assert.equal(config.radius, undefined);
    assert.deepEqual(JSON.parse(config.zone), { type: "circle", radius: 50 });
  });

  test("leaves an already-migrated config untouched", () => {
    const config = { zone: JSON.stringify({ type: "sector", radius: 80 }) };
    assert.equal(migrateConfig(config), false);
    assert.deepEqual(JSON.parse(config.zone), { type: "sector", radius: 80 });
  });

  test("does nothing without a usable legacy radius", () => {
    for (const radius of [0, -5, NaN, undefined, "nope"]) {
      const config = { radius };
      assert.equal(migrateConfig(config), false);
      assert.equal(config.zone, undefined);
    }
  });

  test("is idempotent — a second run reports no change", () => {
    const config = { radius: 50 };
    migrateConfig(config);
    assert.equal(migrateConfig(config), false);
  });
});

describe("readZoneConfig()", () => {
  test("parses a valid zone JSON string", () => {
    const config = { zone: JSON.stringify({ type: "circle", radius: 60 }) };
    assert.deepEqual(readZoneConfig(config), { type: "circle", radius: 60 });
  });

  test("returns null for missing or empty zone", () => {
    assert.equal(readZoneConfig({}), null);
    assert.equal(readZoneConfig({ zone: "" }), null);
  });

  test("returns null for a non-string zone", () => {
    assert.equal(readZoneConfig({ zone: { type: "circle" } }), null);
  });

  test("returns null (not throws) on malformed JSON", () => {
    assert.equal(readZoneConfig({ zone: "{not json" }), null);
  });
});

describe("pickUiConfig()", () => {
  test("projects exactly the whitelisted keys", () => {
    const picked = pickUiConfig({
      connectionType: "WEBSOCKET",
      zone: "secret",
      state: "emergency",
    });
    assert.deepEqual(Object.keys(picked).sort(), [...UI_CONFIG_KEYS].sort());
    assert.equal(picked.connectionType, "WEBSOCKET");
    assert.equal("zone" in picked, false);
    assert.equal("state" in picked, false);
  });

  test("fills undefined for keys absent from the source config", () => {
    const picked = pickUiConfig({});
    assert.equal(picked.defaultBasemap, undefined);
    assert.equal("defaultBasemap" in picked, true);
  });
});

describe("coerceUiConfig()", () => {
  test("returns only the whitelisted keys that were present", () => {
    const updates = coerceUiConfig(APP, {
      connectionType: "REST_POLLING",
      state: "alarm", // not a UI key — must be ignored
    });
    assert.deepEqual(updates, { connectionType: "REST_POLLING" });
  });

  test("coerces integers (rounding) and booleans", () => {
    const updates = coerceUiConfig(APP, {
      fleetFilterRadius: "512.7",
      enableTidePanel: 0,
    });
    assert.equal(updates.fleetFilterRadius, 513);
    assert.equal(updates.enableTidePanel, false);
  });

  test("throws ValidationError on an enum violation", () => {
    assert.throws(
      () => coerceUiConfig(APP, { connectionType: "CARRIER_PIGEON" }),
      ValidationError,
    );
  });

  test("throws ValidationError when a string field gets a non-string", () => {
    assert.throws(
      () => coerceUiConfig(APP, { defaultBasemap: 42 }),
      ValidationError,
    );
  });
});

describe("applyDefaults()", () => {
  test("fills schema defaults for unset keys", () => {
    const config = {};
    applyDefaults(APP, config);
    assert.equal(config.connectionType, "WEBSOCKET");
    assert.equal(config.defaultBasemap, "Satellite");
    assert.equal(config.enableTidePanel, true);
    assert.equal(config.anchorAlarmInterval, 60);
    assert.equal(config.allowZoneOutsideVessel, false);
  });

  test("never overwrites a value the user already set", () => {
    const config = { connectionType: "REST_POLLING", fleetFilterRadius: 999 };
    applyDefaults(APP, config);
    assert.equal(config.connectionType, "REST_POLLING");
    assert.equal(config.fleetFilterRadius, 999);
  });
});
