import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SignalKBus } from "../src/signalk-bus.js";

describe("SignalKBus", () => {
  let messages;
  let bus;

  beforeEach(() => {
    messages = [];
    const app = { handleMessage: (id, msg) => messages.push({ id, msg }) };
    bus = new SignalKBus(app, "test-plugin");
  });

  test("sendDeltas() emits one update with the plugin id and queued values", () => {
    bus.queueDelta("navigation.anchor.state", "on");
    bus.queueDelta("navigation.anchor.maxRadius", 60);
    bus.sendDeltas();

    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, "test-plugin");
    assert.deepEqual(messages[0].msg, {
      updates: [
        {
          values: [
            { path: "navigation.anchor.state", value: "on" },
            { path: "navigation.anchor.maxRadius", value: 60 },
          ],
        },
      ],
    });
  });

  test("sendDeltas() is a no-op when nothing is queued", () => {
    bus.sendDeltas();
    assert.equal(messages.length, 0);
  });

  test("the delta queue is emptied after sending", () => {
    bus.queueDelta("a", 1);
    bus.sendDeltas();
    bus.sendDeltas(); // nothing left to send
    assert.equal(messages.length, 1);
  });

  test("sendMetas() emits a meta-shaped update", () => {
    bus.queueMeta("navigation.anchor.position", { units: "deg" });
    bus.sendMetas();

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].msg, {
      updates: [{ meta: [{ path: "navigation.anchor.position", value: { units: "deg" } }] }],
    });
  });

  test("sendMetas() is a no-op when nothing is queued", () => {
    bus.sendMetas();
    assert.equal(messages.length, 0);
  });

  test("sendUpdates() flushes both deltas and metas", () => {
    bus.queueDelta("a", 1);
    bus.queueMeta("b", { units: "m" });
    bus.sendUpdates();
    assert.equal(messages.length, 2);
  });
});
