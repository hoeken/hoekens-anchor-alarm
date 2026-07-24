import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  migrateConfig,
  readZoneConfig,
  pickUiConfig,
  coerceUiConfig,
  applyDefaults,
  buildSchema,
  defaultUiConfig,
  uiSchemaProperties,
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

describe("UI preference schema split", () => {
  test("the whitelist is exactly the UI preference schema's keys", () => {
    assert.deepEqual(UI_CONFIG_KEYS, Object.keys(uiSchemaProperties));
  });

  test("boat-level settings are not UI preferences", () => {
    assert.equal(UI_CONFIG_KEYS.includes("glitchFilterSpeed"), false);
    assert.equal(UI_CONFIG_KEYS.includes("zone"), false);
    assert.equal(UI_CONFIG_KEYS.includes("state"), false);
  });

  test("the plugin schema no longer carries the UI preference keys", () => {
    const props = buildSchema(APP).properties;
    for (const key of UI_CONFIG_KEYS)
      assert.equal(key in props, false, `${key} should be out of the plugin schema`);
    // ...but boat-level settings remain.
    assert.ok("glitchFilterSpeed" in props);
    assert.ok("zone" in props);
  });

  test("defaultUiConfig() yields a fresh copy of every default", () => {
    const defaults = defaultUiConfig();
    assert.equal(defaults.defaultBasemap, "Satellite");
    assert.equal(defaults.enableTidePanel, true);
    assert.equal(defaults.scopes, "7,5,4,3");
    assert.deepEqual(defaults.charts, {});
    assert.deepEqual(Object.keys(defaults), UI_CONFIG_KEYS);
    defaults.defaultBasemap = "mutated";
    assert.equal(defaultUiConfig().defaultBasemap, "Satellite");
    // Object defaults must be cloned — mutating a resolved config must not
    // poison the schema fragment for the next call.
    defaults.charts.someChart = false;
    assert.deepEqual(defaultUiConfig().charts, {});
  });
});

describe("pickUiConfig()", () => {
  test("projects only whitelisted keys that carry a value", () => {
    const picked = pickUiConfig({
      defaultBasemap: "Satellite",
      zone: "secret",
      state: "emergency",
    });
    assert.deepEqual(picked, { defaultBasemap: "Satellite" });
  });

  test("omits keys absent from the source config", () => {
    assert.deepEqual(pickUiConfig({}), {});
    assert.deepEqual(pickUiConfig(), {});
  });
});

describe("coerceUiConfig()", () => {
  test("returns only the whitelisted keys that were present", () => {
    const updates = coerceUiConfig({
      defaultBasemap: "OpenStreetMap",
      state: "alarm", // not a UI key — must be ignored
      glitchFilterSpeed: 5, // boat-level — must be ignored too
    });
    assert.deepEqual(updates, { defaultBasemap: "OpenStreetMap" });
  });

  test("coerces integers (rounding) and booleans", () => {
    const updates = coerceUiConfig({
      fleetFilterRadius: "512.7",
      enableTidePanel: 0,
    });
    assert.equal(updates.fleetFilterRadius, 513);
    assert.equal(updates.enableTidePanel, false);
  });

  test("throws ValidationError on an enum violation", () => {
    assert.throws(
      () => coerceUiConfig({ defaultBasemap: "CARRIER_PIGEON" }),
      ValidationError,
    );
  });

  test("throws ValidationError when a string field gets a non-string", () => {
    assert.throws(
      () => coerceUiConfig({ defaultBasemap: 42 }),
      ValidationError,
    );
  });

  test("coerces the charts map's values to booleans, keeping its keys", () => {
    const updates = coerceUiConfig({
      charts: { "Fiji_Nanuku-Passage": 0, "NZ614 Marlborough Sounds": true },
    });
    assert.deepEqual(updates.charts, {
      "Fiji_Nanuku-Passage": false,
      "NZ614 Marlborough Sounds": true,
    });
  });

  test("throws ValidationError when charts is not an object", () => {
    for (const charts of ["yes", 42, null, ["chart-a"]]) {
      assert.throws(() => coerceUiConfig({ charts }), ValidationError);
    }
  });
});

describe("applyDefaults()", () => {
  test("fills schema defaults for unset keys", () => {
    const config = {};
    applyDefaults(APP, config);
    assert.equal(config.anchorAlarmInterval, 60);
    assert.equal(config.allowZoneOutsideVessel, false);
    assert.equal(config.glitchFilterSpeed, 0);
    assert.equal(config.state, "emergency");
  });

  test("no longer materializes UI preference defaults into the plugin config", () => {
    const config = {};
    applyDefaults(APP, config);
    assert.equal(config.defaultBasemap, undefined);
    assert.equal(config.enableTidePanel, undefined);
    assert.equal(config.scopes, undefined);
  });

  test("never overwrites a value the user already set", () => {
    const config = { anchorAlarmInterval: 5, glitchFilterSpeed: 9 };
    applyDefaults(APP, config);
    assert.equal(config.anchorAlarmInterval, 5);
    assert.equal(config.glitchFilterSpeed, 9);
  });
});
