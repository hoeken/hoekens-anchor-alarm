import { test, describe } from "node:test";
import assert from "node:assert/strict";
import createPlugin from "../src/index.js";
import { watchZoneFromConfig } from "../shared/watch-zones/index.js";
import { Watchdog } from "../src/watchdog.js";
import { ValidationError, StateError } from "../src/errors.js";
import { createMockApp } from "./mockApp.js";
import { ANCHOR, vesselAt } from "./helpers.js";

function setup() {
  const h = createMockApp();
  const plugin = createPlugin(h.app);
  return { h, plugin };
}

// A persisted circle zone with an anchor position at ANCHOR.
function droppedZone(extra = {}) {
  return JSON.stringify({
    type: "circle",
    radius: 60,
    position: { latitude: ANCHOR.latitude, longitude: ANCHOR.longitude },
    ...extra,
  });
}

// A plugin already in the "anchored + watching" configuration.
function watching(extra = {}) {
  const { h, plugin } = setup();
  plugin.configuration = {
    state: "emergency",
    anchorAlarmInterval: 60,
    enableEngineCheck: false,
    zone: droppedZone(),
    ...extra,
  };
  plugin.alarm_state = "normal";
  return { h, plugin };
}

describe("updateAnchorAlarm()", () => {
  test("emits a notification with the given state, method and message", () => {
    const { h, plugin } = setup();
    plugin.updateAnchorAlarm("alarm", "Custom", ["visual"]);
    assert.deepEqual(h.lastDelta("notifications.navigation.anchor"), {
      state: "alarm",
      method: ["visual"],
      message: "Custom",
    });
  });

  test("defaults the message from the state and uses visual+sound", () => {
    const { h, plugin } = setup();
    plugin.updateAnchorAlarm("warn");
    assert.deepEqual(h.lastDelta("notifications.navigation.anchor"), {
      state: "warn",
      method: ["visual", "sound"],
      message: "Warn",
    });
  });
});

describe("updateAnchorState()", () => {
  test("a circle zone emits position, watchZone, maxRadius and zones meta", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    const zone = watchZoneFromConfig({ type: "circle", radius: 60 });
    plugin.updateAnchorState({ isSet: true, anchorPosition: ANCHOR, zone });

    assert.equal(h.lastDelta("navigation.anchor.state"), "on");
    assert.deepEqual(h.lastDelta("navigation.anchor.position"), {
      latitude: 37.8,
      longitude: -122.4,
    });
    assert.deepEqual(h.lastDelta("navigation.anchor.watchZone"), {
      type: "circle",
      radius: 60,
    });
    assert.equal(h.lastDelta("navigation.anchor.maxRadius"), 60);
    assert.deepEqual(h.lastDelta("navigation.anchor.meta").zones, [
      { state: "normal", lower: 0, upper: 60 },
      { state: "emergency", lower: 60 },
    ]);
  });

  test("a non-circle zone clears maxRadius", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    const fakeZone = {
      getConfig: () => ({ type: "weird" }),
      getCircleRadius: () => null,
    };
    plugin.updateAnchorState({ isSet: true, zone: fakeZone });
    assert.equal(h.lastDelta("navigation.anchor.maxRadius"), null);
  });

  test("clearing the anchor nulls every anchor path", () => {
    const { h, plugin } = setup();
    plugin.updateAnchorState({ isSet: false });
    assert.equal(h.lastDelta("navigation.anchor.state"), "off");
    assert.equal(h.lastDelta("navigation.anchor.position"), null);
    assert.equal(h.lastDelta("navigation.anchor.maxRadius"), null);
    assert.equal(h.lastDelta("navigation.anchor.watchZone"), null);
    assert.equal(h.lastDelta("navigation.anchor.currentRadius"), null);
    assert.equal(h.lastDelta("navigation.anchor.distanceFromBow"), null);
    assert.equal(h.lastDelta("navigation.anchor.bearingTrue"), null);
    assert.equal(h.lastDelta("navigation.anchor.apparentBearing"), null);
  });

  test("currentRadius is emitted as a parsed number", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    plugin.updateAnchorState({ isSet: true, currentRadius: "42.5" });
    assert.equal(h.lastDelta("navigation.anchor.currentRadius"), 42.5);
  });

  test("emits bow-referenced distance and bearings when provided", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    plugin.updateAnchorState({
      isSet: true,
      distanceFromBow: 33.3,
      bearingTrue: 1.5,
      apparentBearing: 0.75,
    });
    assert.equal(h.lastDelta("navigation.anchor.distanceFromBow"), 33.3);
    assert.equal(h.lastDelta("navigation.anchor.bearingTrue"), 1.5);
    assert.equal(h.lastDelta("navigation.anchor.apparentBearing"), 0.75);
  });

  test("emits a null apparentBearing to clear it, but leaves omitted paths untouched", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    plugin.updateAnchorState({ isSet: true, apparentBearing: null });
    assert.equal(h.lastDelta("navigation.anchor.apparentBearing"), null);
    // bearingTrue/distanceFromBow weren't in params, so they aren't emitted.
    assert.equal(h.hasDelta("navigation.anchor.bearingTrue"), false);
    assert.equal(h.hasDelta("navigation.anchor.distanceFromBow"), false);
  });
});

describe("resolveZone()", () => {
  test("builds a zone from a config object", () => {
    const { plugin } = setup();
    assert.equal(plugin.resolveZone({ type: "circle", radius: 50 }).getCircleRadius(), 50);
  });

  test("rejects a non-object zone", () => {
    const { plugin } = setup();
    assert.throws(() => plugin.resolveZone("nope"), ValidationError);
  });

  test("wraps an unknown zone type as a ValidationError", () => {
    const { plugin } = setup();
    assert.throws(() => plugin.resolveZone({ type: "triangle" }), ValidationError);
  });

  test("falls back to the saved zone when none is passed", () => {
    const { plugin } = setup();
    plugin.configuration = { zone: droppedZone() };
    assert.equal(plugin.resolveZone(null).getCircleRadius(), 60);
  });

  test("throws when nothing is passed and nothing is saved", () => {
    const { plugin } = setup();
    plugin.configuration = {};
    assert.throws(() => plugin.resolveZone(null), ValidationError);
  });
});

describe("dropAnchor()", () => {
  test("rejects a missing position", () => {
    const { plugin } = setup();
    plugin.configuration = {};
    assert.throws(
      () => plugin.dropAnchor({ zone: { type: "circle", radius: 60 } }),
      ValidationError,
    );
  });

  test("rejects a non-numeric position", () => {
    const { plugin } = setup();
    plugin.configuration = {};
    assert.throws(
      () => plugin.dropAnchor({
        position: { latitude: "abc", longitude: 1 },
        zone: { type: "circle", radius: 60 },
      }),
      ValidationError,
    );
  });

  test("refuses to drop when the boat is already outside the zone", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    h.setSelfPath("navigation.position.value", vesselAt(ANCHOR, 200, 0));
    assert.throws(
      () => plugin.dropAnchor({ position: ANCHOR, zone: { type: "circle", radius: 60 } }),
      StateError,
    );
  });

  test("allows a drop outside the zone when allowZoneOutsideVessel is set", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency", allowZoneOutsideVessel: true };
    h.setSelfPath("navigation.position.value", vesselAt(ANCHOR, 200, 0));
    plugin.dropAnchor({ position: ANCHOR, zone: { type: "circle", radius: 60 } });

    assert.equal(h.lastDelta("navigation.anchor.state"), "on");
    assert.equal(h.calls.subscriptions.length, 1);
  });

  test("success emits anchor deltas, saves zone+position, and starts watching", () => {
    const { h, plugin } = setup();
    plugin.configuration = { state: "emergency" };
    plugin.dropAnchor({ position: ANCHOR, zone: { type: "circle", radius: 60 } });

    assert.equal(h.lastDelta("navigation.anchor.state"), "on");
    assert.deepEqual(h.lastDelta("navigation.anchor.position"), {
      latitude: 37.8,
      longitude: -122.4,
    });
    const saved = JSON.parse(plugin.configuration.zone);
    assert.equal(saved.type, "circle");
    assert.equal(saved.radius, 60);
    assert.deepEqual(saved.position, { latitude: 37.8, longitude: -122.4 });
    assert.ok(h.calls.savePluginOptions.length >= 1);
    assert.equal(h.calls.subscriptions.length, 1);
  });
});

describe("setZone()", () => {
  test("rejects a null zone", () => {
    const { plugin } = setup();
    plugin.configuration = { zone: droppedZone() };
    assert.throws(() => plugin.setZone(null), ValidationError);
  });

  test("fails when no anchor is dropped", () => {
    const { plugin } = setup();
    plugin.configuration = {};
    assert.throws(() => plugin.setZone({ type: "circle", radius: 80 }), StateError);
  });

  test("fails when there is no GPS fix", () => {
    const { plugin } = setup();
    plugin.configuration = { zone: droppedZone() };
    assert.throws(() => plugin.setZone({ type: "circle", radius: 80 }), StateError);
  });

  test("refuses a zone that no longer contains the boat", () => {
    const { h, plugin } = setup();
    plugin.configuration = { zone: droppedZone(), state: "emergency" };
    h.setSelfPath("navigation.position.value", vesselAt(ANCHOR, 90, 0));
    assert.throws(() => plugin.setZone({ type: "circle", radius: 60 }), StateError);
  });

  test("allows a zone that excludes the boat when allowZoneOutsideVessel is set", () => {
    const { h, plugin } = setup();
    plugin.configuration = {
      zone: droppedZone(),
      state: "emergency",
      allowZoneOutsideVessel: true,
    };
    h.setSelfPath("navigation.position.value", vesselAt(ANCHOR, 90, 0));
    plugin.setZone({ type: "circle", radius: 60 });

    assert.equal(JSON.parse(plugin.configuration.zone).radius, 60);
    assert.ok(h.calls.savePluginOptions.length >= 1);
  });

  test("success updates the saved zone and persists", () => {
    const { h, plugin } = setup();
    plugin.configuration = { zone: droppedZone(), state: "emergency" };
    h.setSelfPath("navigation.position.value", vesselAt(ANCHOR, 40, 0));
    plugin.setZone({ type: "circle", radius: 120 });

    const saved = JSON.parse(plugin.configuration.zone);
    assert.equal(saved.radius, 120);
    assert.deepEqual(saved.position, { latitude: 37.8, longitude: -122.4 });
    assert.ok(h.calls.savePluginOptions.length >= 1);
  });
});

describe("setRadius() (legacy shim)", () => {
  test("rejects null and non-numeric radius", () => {
    const { plugin } = setup();
    plugin.configuration = {};
    assert.throws(() => plugin.setRadius(null), ValidationError);
    assert.throws(() => plugin.setRadius("abc"), ValidationError);
  });

  test("routes a numeric radius through setZone", () => {
    const { h, plugin } = setup();
    plugin.configuration = { zone: droppedZone(), state: "emergency" };
    h.setSelfPath("navigation.position.value", vesselAt(ANCHOR, 30, 0));
    plugin.setRadius(150);
    assert.equal(JSON.parse(plugin.configuration.zone).radius, 150);
  });
});

describe("raiseAnchor()", () => {
  test("clears the saved zone, persists, and stops watching", () => {
    const { h, plugin } = setup();
    plugin.configuration = { zone: droppedZone() };
    plugin.raiseAnchor();
    assert.equal(plugin.configuration.zone, undefined);
    assert.ok(h.calls.savePluginOptions.length >= 1);
    assert.equal(h.lastDelta("navigation.anchor.state"), "off");
    assert.equal(h.lastStatus(), "Off");
  });
});

describe("checkPosition()", () => {
  test("inside the zone keeps the state normal and reports currentRadius", () => {
    const { h, plugin } = watching();
    plugin.checkPosition(vesselAt(ANCHOR, 40, 0));
    assert.equal(plugin.alarm_state, "normal");
    assert.ok(Math.abs(h.lastDelta("navigation.anchor.currentRadius") - 40) < 1);
    assert.equal(h.hasDelta("notifications.navigation.anchor"), false);
  });

  test("outside the zone raises the configured alarm state", () => {
    const { h, plugin } = watching();
    plugin.checkPosition(vesselAt(ANCHOR, 120, 0));
    assert.equal(plugin.alarm_state, "emergency");
    const note = h.lastDelta("notifications.navigation.anchor");
    assert.equal(note.state, "emergency");
    assert.match(note.message, /Dragging/);
    assert.ok(plugin.lastAlarmSent > 0);
    assert.ok(h.calls.pluginError.includes("Dragging"));
  });

  test("engine override disables the alarm and raises the anchor", () => {
    const { h, plugin } = watching({ enableEngineCheck: true });
    h.setSelfPath("propulsion", {
      port: { revolutions: { value: 900, timestamp: new Date().toISOString() } },
    });
    plugin.checkPosition(vesselAt(ANCHOR, 120, 0));

    assert.equal(plugin.alarm_state, "normal");
    const note = h.lastDelta("notifications.navigation.anchor");
    assert.equal(note.state, "normal");
    assert.match(note.message, /Engines on/);
    assert.equal(plugin.configuration.zone, undefined); // raiseAnchor cleared it
  });

  test("does not re-alarm within the throttle interval", () => {
    const { h, plugin } = watching();
    plugin.alarm_state = "emergency";
    plugin.lastAlarmSent = Date.now();
    h.reset();
    plugin.checkPosition(vesselAt(ANCHOR, 120, 0));
    assert.equal(h.hasDelta("notifications.navigation.anchor"), false);
    assert.equal(h.hasDelta("navigation.anchor.currentRadius"), true);
  });

  test("reports bow-referenced distance and bearings using the heading", () => {
    const { h, plugin } = watching();
    h.setSelfPath("navigation.headingTrue.value", 0); // pointing due north
    // Vessel 40 m due south of the anchor → anchor bears due north, dead ahead.
    plugin.checkPosition(vesselAt(ANCHOR, 40, 180));
    assert.ok(Math.abs(h.lastDelta("navigation.anchor.distanceFromBow") - 40) < 1);
    assert.ok(Math.abs(h.lastDelta("navigation.anchor.bearingTrue")) < 0.01); // ~0 rad
    assert.ok(Math.abs(h.lastDelta("navigation.anchor.apparentBearing")) < 0.01); // dead ahead
  });

  test("applies the GPS→bow offset along the heading", () => {
    const { h, plugin } = watching();
    h.setSelfPath("navigation.headingTrue.value", 0); // north
    h.setSelfPath("sensors.gps.fromBow.value", 10); // antenna 10 m aft of the bow
    // Vessel 40 m due south → bow sits 10 m north of the antenna → 30 m out.
    plugin.checkPosition(vesselAt(ANCHOR, 40, 180));
    assert.ok(Math.abs(h.lastDelta("navigation.anchor.distanceFromBow") - 30) < 1);
  });

  test("nulls apparentBearing when heading is unknown but still reports the rest", () => {
    const { h, plugin } = watching();
    plugin.checkPosition(vesselAt(ANCHOR, 40, 180));
    assert.equal(h.lastDelta("navigation.anchor.apparentBearing"), null);
    assert.ok(Math.abs(h.lastDelta("navigation.anchor.distanceFromBow") - 40) < 1);
    assert.equal(h.hasDelta("navigation.anchor.bearingTrue"), true);
  });
});

describe("rebroadcastAnchorState()", () => {
  test("re-emits the static anchor paths from the saved zone", () => {
    const { h, plugin } = watching();
    h.reset();
    plugin.rebroadcastAnchorState();

    assert.equal(h.lastDelta("navigation.anchor.state"), "on");
    assert.deepEqual(h.lastDelta("navigation.anchor.position"), {
      latitude: ANCHOR.latitude,
      longitude: ANCHOR.longitude,
    });
    assert.deepEqual(h.lastDelta("navigation.anchor.watchZone"), {
      type: "circle",
      radius: 60,
    });
    assert.equal(h.lastDelta("navigation.anchor.maxRadius"), 60);
  });

  test("does not re-emit the per-fix dynamic paths", () => {
    const { h, plugin } = watching();
    h.reset();
    plugin.rebroadcastAnchorState();
    assert.equal(h.hasDelta("navigation.anchor.currentRadius"), false);
    assert.equal(h.hasDelta("navigation.anchor.distanceFromBow"), false);
    assert.equal(h.hasDelta("navigation.anchor.bearingTrue"), false);
    assert.equal(h.hasDelta("navigation.anchor.apparentBearing"), false);
  });

  test("emits nothing when no anchor is dropped", () => {
    const { h, plugin } = setup();
    plugin.configuration = {};
    plugin.rebroadcastAnchorState();
    assert.equal(h.hasDelta("navigation.anchor.position"), false);
    assert.equal(h.hasDelta("navigation.anchor.state"), false);
  });

  test("startWatchingPosition schedules the timer and stop clears it", () => {
    const { plugin } = watching();
    plugin.startWatchingPosition();
    assert.ok(plugin.rebroadcastTimer);
    plugin.stopWatchingPosition();
    assert.equal(plugin.rebroadcastTimer, null);
  });
});

describe("handlePositionUpdate()", () => {
  test("a position update triggers a position check", () => {
    const { h, plugin } = watching();
    plugin.handlePositionUpdate({
      updates: [{ values: [{ path: "navigation.position", value: vesselAt(ANCHOR, 40, 0) }] }],
    });
    assert.equal(h.hasDelta("navigation.anchor.currentRadius"), true);
  });

  test("a delta without a position is ignored", () => {
    const { h, plugin } = watching();
    plugin.handlePositionUpdate({
      updates: [{ values: [{ path: "navigation.speedOverGround", value: 3 }] }],
    });
    assert.equal(h.hasDelta("navigation.anchor.currentRadius"), false);
  });

  test("resets the position watchdog when a fix arrives", () => {
    const { plugin } = watching();
    let resets = 0;
    plugin.positionWatchdogTimer = { reset: () => resets++ };
    plugin.handlePositionUpdate({
      updates: [{ values: [{ path: "navigation.position", value: vesselAt(ANCHOR, 40, 0) }] }],
    });
    assert.equal(resets, 1);
  });
});

describe("start()", () => {
  test("migrates a legacy radius config and persists the upgrade", () => {
    const { h, plugin } = setup();
    const ret = plugin.start({ radius: 50, noPositionAlarmTime: 0 });

    assert.equal(ret, undefined);
    assert.deepEqual(JSON.parse(plugin.configuration.zone), { type: "circle", radius: 50 });
    assert.equal(plugin.configuration.radius, undefined);
    assert.equal(h.calls.savePluginOptions.length, 1);
    assert.ok(h.metas().length > 0);
    assert.equal(h.calls.subscriptions.length, 0); // no saved position → not watching
    assert.equal(h.calls.actionHandlers.length, 2);
  });

  test("resumes watching when a dropped anchor is already saved", () => {
    const { h, plugin } = setup();
    const ret = plugin.start({ zone: droppedZone(), noPositionAlarmTime: 0, state: "emergency" });

    assert.equal(ret, undefined);
    assert.equal(h.lastDelta("navigation.anchor.state"), "on");
    assert.equal(h.calls.subscriptions.length, 1);
    assert.equal(h.calls.savePluginOptions.length, 0); // nothing to migrate
  });

  test("creates a position watchdog when noPositionAlarmTime > 0", () => {
    const { plugin } = setup();
    plugin.start({ noPositionAlarmTime: 60 });
    assert.ok(plugin.positionWatchdogTimer instanceof Watchdog);
  });
});

describe("stop()", () => {
  test("resets the alarm, clears anchor state, and stops watching", () => {
    const { h, plugin } = setup();
    plugin.start({ zone: droppedZone(), noPositionAlarmTime: 0, state: "emergency" });
    plugin.alarm_state = "emergency";
    h.reset();
    plugin.stop();

    assert.equal(plugin.alarm_state, "normal");
    assert.equal(h.lastDelta("navigation.anchor.state"), "off");
    assert.equal(h.lastStatus(), "Stopped");
  });
});
