import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SignalKHelper } from "../ui/js/SignalKHelper.js";

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("SignalKHelper.trackWindow", () => {
  test("with no open session it is the last day at one-second spacing", () => {
    assert.deepEqual(SignalKHelper.trackWindow(undefined, NOW), {
      from: "2026-09-28T12:00:00.000Z",
      resolution: 1,
    });
  });

  test("a session younger than a day still gets the whole day", () => {
    const droppedAt = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    assert.deepEqual(SignalKHelper.trackWindow(droppedAt, NOW), {
      from: "2026-09-28T12:00:00.000Z",
      resolution: 1,
    });
  });

  test("a longer session reaches back to the drop, coarser to stay in budget", () => {
    const droppedAt = new Date(NOW - 3 * DAY_MS).toISOString();
    assert.deepEqual(SignalKHelper.trackWindow(droppedAt, NOW), {
      from: droppedAt,
      resolution: 3,
    });
  });

  test("the spacing rounds up, never down, past a whole number of days", () => {
    const droppedAt = new Date(NOW - 30 * DAY_MS - 1000).toISOString();
    assert.equal(SignalKHelper.trackWindow(droppedAt, NOW).resolution, 31);
  });

  test("an unreadable drop time falls back to the last day", () => {
    assert.equal(
      SignalKHelper.trackWindow("not a date", NOW).from,
      "2026-09-28T12:00:00.000Z",
    );
  });
});

describe("SignalKHelper.trackQuery", () => {
  test("sends exactly the parameters tracks plugin 3.x reads", () => {
    const params = new URLSearchParams(
      SignalKHelper.trackQuery({
        from: "2026-09-28T12:00:00.000Z",
        resolution: 3,
      }),
    );
    assert.deepEqual([...params.keys()], ["from", "resolution", "times"]);
    assert.equal(params.get("from"), "2026-09-28T12:00:00.000Z");
    assert.equal(params.get("resolution"), "3s");
    assert.equal(params.get("times"), "true");
  });
});

describe("SignalKHelper.trackPoints", () => {
  test("joins segments, pairing each point with its time", () => {
    const track = {
      type: "MultiLineString",
      coordinates: [
        [
          [24.9, 60.1],
          [24.91, 60.11],
        ],
        [[24.92, 60.12]],
      ],
      times: [
        ["2026-09-29T10:00:00.000Z", "2026-09-29T10:00:01.000Z"],
        ["2026-09-29T11:00:00.000Z"],
      ],
    };
    assert.deepEqual(SignalKHelper.trackPoints(track), [
      { latitude: 60.1, longitude: 24.9, time: Date.parse("2026-09-29T10:00:00.000Z") },
      { latitude: 60.11, longitude: 24.91, time: Date.parse("2026-09-29T10:00:01.000Z") },
      { latitude: 60.12, longitude: 24.92, time: Date.parse("2026-09-29T11:00:00.000Z") },
    ]);
  });

  test("a track without times (tracks plugin 2.x) has null times", () => {
    const track = {
      type: "MultiLineString",
      coordinates: [
        [
          [24.9, 60.1],
          [24.91, 60.11],
        ],
      ],
    };
    assert.deepEqual(
      SignalKHelper.trackPoints(track).map((p) => p.time),
      [null, null],
    );
  });

  test("a missing or empty track has no points", () => {
    assert.deepEqual(SignalKHelper.trackPoints(undefined), []);
    assert.deepEqual(SignalKHelper.trackPoints({ coordinates: [] }), []);
  });
});
