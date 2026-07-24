import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { UiConfigStore } from "../src/ui-config.js";
import { defaultUiConfig, UI_CONFIG_KEYS } from "../src/schema.js";
import { createMockApp } from "./mockApp.js";

describe("UiConfigStore", () => {
  let harness;
  let store;

  beforeEach(() => {
    harness = createMockApp();
    store = new UiConfigStore(harness.app);
  });

  afterEach(() => {
    harness.cleanupDataDir();
  });

  function readRaw(file) {
    return JSON.parse(
      fs.readFileSync(path.join(harness.dataDir(), "ui-config", file), "utf8"),
    );
  }

  describe("identityFor()", () => {
    test("uses the principal identifier (username or device clientId)", () => {
      assert.equal(
        store.identityFor({ skPrincipal: { identifier: "bob" } }),
        "bob",
      );
    });

    test("maps the shared anonymous-readonly 'AUTO' principal to the anonymous bucket", () => {
      assert.equal(
        store.identityFor({ skPrincipal: { identifier: "AUTO" } }),
        null,
      );
    });

    test("maps a missing principal (security disabled) to the anonymous bucket", () => {
      assert.equal(store.identityFor({}), null);
      assert.equal(store.identityFor(undefined), null);
    });
  });

  describe("fileFor()", () => {
    test("encodes identities so they can't escape the store directory", () => {
      const file = store.fileFor("../evil/../../name");
      assert.equal(file.includes("/"), false);
      assert.ok(file.startsWith("identity-"));
    });

    test("an identity literally named 'anonymous' can't collide with the anonymous bucket", () => {
      assert.notEqual(store.fileFor("anonymous"), store.fileFor(null));
    });
  });

  describe("resolve()", () => {
    test("returns pure schema defaults when nothing is stored", () => {
      assert.deepEqual(store.resolve(null), defaultUiConfig());
      assert.deepEqual(store.resolve("bob"), defaultUiConfig());
    });

    test("layers defaults, then boat defaults, then the identity's own keys", () => {
      store.writeFile("boat-defaults.json", {
        defaultBasemap: "OpenStreetMap",
        enableTidePanel: false,
      });
      store.save("bob", { defaultBasemap: "Blank" });

      const bob = store.resolve("bob");
      assert.equal(bob.defaultBasemap, "Blank"); // own key wins
      assert.equal(bob.enableTidePanel, false); // boat baseline shows through
      assert.equal(bob.enableWindPanel, true); // schema default underneath

      const alice = store.resolve("alice");
      assert.equal(alice.defaultBasemap, "OpenStreetMap"); // untouched by bob
    });

    test("always carries every preference key", () => {
      assert.deepEqual(
        Object.keys(store.resolve("nobody")).sort(),
        [...UI_CONFIG_KEYS].sort(),
      );
    });

    test("tolerates a corrupt store file by falling back to lower layers", () => {
      const dir = path.join(harness.dataDir(), "ui-config");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, store.fileFor("bob")), "{not json");
      assert.deepEqual(store.resolve("bob"), defaultUiConfig());
    });

    test("drops foreign keys a stale file smuggled in", () => {
      store.writeFile(store.fileFor("bob"), {
        defaultBasemap: "Blank",
        zone: "should never surface",
      });
      assert.equal("zone" in store.resolve("bob"), false);
    });
  });

  describe("save()", () => {
    test("merges partial updates into the identity's sparse file", () => {
      store.save("bob", { enableTidePanel: false });
      store.save("bob", { defaultBasemap: "Blank" });
      const raw = readRaw(store.fileFor("bob"));
      assert.equal(raw.version, 1);
      assert.deepEqual(raw.config, {
        enableTidePanel: false,
        defaultBasemap: "Blank",
      });
    });

    test("the anonymous bucket persists to its own reserved file", () => {
      store.save(null, { enableWindPanel: false });
      assert.equal(readRaw("anonymous.json").config.enableWindPanel, false);
      assert.equal(store.resolve(null).enableWindPanel, false);
      assert.equal(store.resolve("bob").enableWindPanel, true);
    });
  });

  describe("saveChartEnabled()", () => {
    test("stores one chart's flag without touching other charts or keys", () => {
      store.save("bob", { defaultBasemap: "Blank" });
      store.saveChartEnabled("bob", "Fiji_Nanuku-Passage", false);
      store.saveChartEnabled("bob", "NZ614", true);
      assert.deepEqual(readRaw(store.fileFor("bob")).config, {
        defaultBasemap: "Blank",
        charts: { "Fiji_Nanuku-Passage": false, NZ614: true },
      });
    });

    test("re-toggling a chart overwrites its previous flag", () => {
      store.saveChartEnabled("bob", "Fiji_Nanuku-Passage", false);
      store.saveChartEnabled("bob", "Fiji_Nanuku-Passage", true);
      assert.deepEqual(store.resolve("bob").charts, {
        "Fiji_Nanuku-Passage": true,
      });
    });

    test("chart choices are per identity, defaulting to an empty map", () => {
      store.saveChartEnabled("bob", "Fiji_Nanuku-Passage", false);
      assert.deepEqual(store.resolve("bob").charts, {
        "Fiji_Nanuku-Passage": false,
      });
      assert.deepEqual(store.resolve("alice").charts, {});
      assert.deepEqual(store.resolve(null).charts, {});
    });
  });

  describe("migrateFromPluginConfig()", () => {
    test("reports no change when the plugin config carries no UI keys", () => {
      const config = { zone: "", state: "emergency", glitchFilterSpeed: 2 };
      assert.equal(store.migrateFromPluginConfig(config), false);
      assert.equal(
        fs.existsSync(path.join(harness.dataDir(), "ui-config")),
        false,
      );
    });

    test("lifts legacy UI keys into boat-defaults.json and strips them from the config", () => {
      const config = {
        defaultBasemap: "OpenStreetMap",
        scopes: "5,3",
        glitchFilterSpeed: 2, // boat-level — must survive
        zone: '{"type":"circle","radius":60}',
      };
      assert.equal(store.migrateFromPluginConfig(config), true);

      assert.deepEqual(readRaw("boat-defaults.json").config, {
        defaultBasemap: "OpenStreetMap",
        scopes: "5,3",
      });
      assert.deepEqual(config, {
        glitchFilterSpeed: 2,
        zone: '{"type":"circle","radius":60}',
      });
    });

    test("never overwrites an existing boat-defaults.json, but still strips the config", () => {
      store.writeFile("boat-defaults.json", { defaultBasemap: "Blank" });
      const config = { defaultBasemap: "Satellite" };
      assert.equal(store.migrateFromPluginConfig(config), true);
      assert.equal(readRaw("boat-defaults.json").config.defaultBasemap, "Blank");
      assert.equal(config.defaultBasemap, undefined);
    });

    test("is idempotent — a second run reports no change", () => {
      const config = { defaultBasemap: "OpenStreetMap" };
      store.migrateFromPluginConfig(config);
      assert.equal(store.migrateFromPluginConfig(config), false);
    });

    test("migrated preferences feed every identity's resolution", () => {
      const config = { enableSeascape: true };
      store.migrateFromPluginConfig(config);
      assert.equal(store.resolve("bob").enableSeascape, true);
      assert.equal(store.resolve(null).enableSeascape, true);
    });
  });
});
