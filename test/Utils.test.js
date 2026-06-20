import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Utils } from "../src/utils.js";

// A SignalK timestamp "now" (fresh) and one far in the past (stale).
const FRESH = new Date().toISOString();
const STALE = "2000-01-01T00:00:00.000Z";

// Minimal app stub: checkEngineState only ever reads getSelfPath("propulsion").
function appWith(propulsion) {
  return { getSelfPath: (path) => (path === "propulsion" ? propulsion : undefined) };
}

describe("Utils.isFresh()", () => {
  test("false for missing data", () => {
    assert.equal(Utils.isFresh(undefined), false);
    assert.equal(Utils.isFresh(null), false);
  });

  test("true for a just-now timestamp", () => {
    assert.equal(Utils.isFresh({ timestamp: FRESH }), true);
  });

  test("false for an ancient timestamp", () => {
    assert.equal(Utils.isFresh({ timestamp: STALE }), false);
  });

  test("respects a custom max age", () => {
    const tenMinutesAgo = new Date(Date.now() - 600 * 1000).toISOString();
    assert.equal(Utils.isFresh({ timestamp: tenMinutesAgo }, 300), false);
    assert.equal(Utils.isFresh({ timestamp: tenMinutesAgo }, 900), true);
  });
});

describe("Utils.checkEngineState()", () => {
  test("false when there is no propulsion data at all", () => {
    assert.equal(Utils.checkEngineState(appWith(undefined)), false);
  });

  test("true when revolutions are fresh and positive", () => {
    const app = appWith({
      port: { revolutions: { value: 850, timestamp: FRESH } },
    });
    assert.equal(Utils.checkEngineState(app), true);
  });

  test("false when revolutions are positive but stale", () => {
    const app = appWith({
      port: { revolutions: { value: 850, timestamp: STALE } },
    });
    assert.equal(Utils.checkEngineState(app), false);
  });

  test("false when revolutions are fresh but zero (engine off)", () => {
    const app = appWith({
      port: { revolutions: { value: 0, timestamp: FRESH } },
    });
    assert.equal(Utils.checkEngineState(app), false);
  });

  test("true when state is 'started' and fresh", () => {
    const app = appWith({
      port: { state: { value: "started", timestamp: FRESH } },
    });
    assert.equal(Utils.checkEngineState(app), true);
  });

  test("false when state is 'stopped'", () => {
    const app = appWith({
      port: { state: { value: "stopped", timestamp: FRESH } },
    });
    assert.equal(Utils.checkEngineState(app), false);
  });

  test("true when any one of several engines is running", () => {
    const app = appWith({
      port: { revolutions: { value: 0, timestamp: FRESH } },
      starboard: { revolutions: { value: 1200, timestamp: FRESH } },
    });
    assert.equal(Utils.checkEngineState(app), true);
  });
});
