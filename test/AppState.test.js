// Regression tests for the websocket meta lifecycle in AppState.
//
// The panels went blank after outages because envelopes rebuilt purely from
// value deltas (their source was offline when the /vessels snapshot loaded,
// or the snapshot value was rejected as stale) carried no meta.displayUnits,
// so DisplayUnit.formatDelta returned "". These tests pin the three ways an
// envelope now (re)gains meta: stream meta updates (handleMeta), the graft
// off a stale-but-meta-bearing snapshot value (extract), and the depth
// scaffolding guarantee (cleanDisplayUnits).

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AppState } from "../ui/js/AppState.js";

const DEPTH_PATH = "environment.depth.belowSurface";
const DEPTH_META = { units: "m", displayUnits: { category: "depth" } };

const now = () => new Date().toISOString();

// extract()'s stale branch logs a warning + stack trace; keep test output clean.
let warn, trace;
beforeEach(() => {
  warn = console.warn;
  trace = console.trace;
  console.warn = () => {};
  console.trace = () => {};
});
afterEach(() => {
  console.warn = warn;
  console.trace = trace;
});

describe("AppState.handleMeta()", () => {
  test("meta stashed before the first value delta lands on the new envelope", () => {
    const state = new AppState();
    state.handleMeta(DEPTH_PATH, DEPTH_META);
    state.handleDelta(now(), { path: DEPTH_PATH, value: 5.2 });

    assert.equal(state.belowSurface.value, 5.2);
    assert.equal(state.belowSurface.meta.displayUnits.category, "depth");
  });

  test("meta arriving after the envelope exists refreshes it in place", () => {
    const state = new AppState();
    state.handleDelta(now(), { path: DEPTH_PATH, value: 5.2 });
    assert.equal(state.belowSurface.meta, undefined);

    state.handleMeta(DEPTH_PATH, DEPTH_META);
    assert.equal(state.belowSurface.meta.displayUnits.category, "depth");
  });

  test("a meta-less envelope picks up stashed meta on its next value delta", () => {
    const state = new AppState();
    state.handleDelta(now(), { path: DEPTH_PATH, value: 5.2 });
    state._pathMeta[DEPTH_PATH] = DEPTH_META;

    state.handleDelta(now(), { path: DEPTH_PATH, value: 4.8 });
    assert.equal(state.belowSurface.value, 4.8);
    assert.equal(state.belowSurface.meta.displayUnits.category, "depth");
  });

  test("ignores paths we don't track and empty meta without throwing", () => {
    const state = new AppState();
    state.handleMeta("environment.depth", DEPTH_META);
    state.handleMeta(DEPTH_PATH, null);
    assert.equal(state.belowSurface, undefined);
  });
});

describe("AppState.extract() stale branch", () => {
  test("keeps the live envelope but grafts the stale snapshot's meta", () => {
    const state = new AppState();
    // Envelope built by the delta stream before the snapshot resolved: fresh
    // value, no meta.
    state.belowSurface = { value: 4.2, timestamp: now() };
    // Snapshot whose depth value is far too old to trust, but whose meta is
    // still perfectly good.
    const tree = {
      environment: {
        depth: {
          belowSurface: {
            value: 9.9,
            timestamp: "2020-01-01T00:00:00.000Z",
            meta: DEPTH_META,
          },
        },
      },
    };

    const result = state.extract(tree, DEPTH_PATH, state.belowSurface);
    assert.equal(result, state.belowSurface);
    assert.equal(result.value, 4.2);
    assert.equal(result.meta.displayUnits.category, "depth");
  });
});

describe("AppState.cleanDisplayUnits()", () => {
  test("creates the depth displayUnits scaffolding when meta never arrived", () => {
    const state = new AppState();
    state.belowKeel = { value: 3.1, timestamp: now() };
    state.cleanDisplayUnits();
    assert.equal(state.belowKeel.meta.displayUnits.category, "depth");
  });

  test("still fixes the wrong 'distance' category", () => {
    const state = new AppState();
    state.belowSurface = {
      value: 3.1,
      timestamp: now(),
      meta: { displayUnits: { category: "distance" } },
    };
    state.cleanDisplayUnits();
    assert.equal(state.belowSurface.meta.displayUnits.category, "depth");
  });

  test("leaves a correct category alone", () => {
    const state = new AppState();
    state.belowSurface = {
      value: 3.1,
      timestamp: now(),
      meta: { displayUnits: { category: "depth", symbol: "ft" } },
    };
    state.cleanDisplayUnits();
    assert.equal(state.belowSurface.meta.displayUnits.symbol, "ft");
  });
});

describe("AppState.calculateScope()", () => {
  test("returns 0 when the surface depth value is null (lost bottom lock)", () => {
    const state = new AppState();
    state.boatConfig = { anchorRollerHeight: 1.5 };
    state.belowSurface = { value: null, timestamp: now() };
    assert.equal(state.calculateScope(5), 0);
  });

  test("computes normally with a real reading", () => {
    const state = new AppState();
    state.boatConfig = { anchorRollerHeight: 1 };
    state.belowSurface = { value: 4, timestamp: now() };
    state.tidalRise = 0;
    assert.equal(state.calculateScope(5), 25);
  });
});
