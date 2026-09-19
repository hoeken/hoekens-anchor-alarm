import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SignalKHelper } from "../ui/js/SignalKHelper.js";

// The History API returns navigation.position as a [longitude, latitude]
// pair (the server's OpenAPI schema; signalk-to-influxdb2, signalk-parquet),
// while some providers return the data model's {latitude, longitude}. A
// track read from history must come out the same from either.
describe("SignalKHelper.positionsFromHistory", () => {
  const response = (rows) => ({
    context: "vessels.self",
    range: { from: "2026-05-21T00:00:00Z", to: "2026-05-22T00:00:00Z" },
    values: [
      { path: "navigation.speedOverGround", method: "average" },
      { path: "navigation.position", method: "first" },
    ],
    data: rows,
  });

  test("reads a [longitude, latitude] pair, as the History API defines it", () => {
    const positions = SignalKHelper.positionsFromHistory(
      response([["2026-05-21T13:00:00Z", 3.1, [20.743, 38.374]]]),
    );
    assert.deepEqual(positions, [
      { time: "2026-05-21T13:00:00Z", latitude: 38.374, longitude: 20.743 },
    ]);
  });

  test("ignores an altitude third element", () => {
    const positions = SignalKHelper.positionsFromHistory(
      response([["2026-05-21T13:00:00Z", 3.1, [20.743, 38.374, 12]]]),
    );
    assert.deepEqual(positions, [
      { time: "2026-05-21T13:00:00Z", latitude: 38.374, longitude: 20.743 },
    ]);
  });

  test("reads a {latitude, longitude} object too", () => {
    const positions = SignalKHelper.positionsFromHistory(
      response([
        ["2026-05-21T13:00:00Z", 3.1, { latitude: 38.374, longitude: 20.743 }],
      ]),
    );
    assert.deepEqual(positions, [
      { time: "2026-05-21T13:00:00Z", latitude: 38.374, longitude: 20.743 },
    ]);
  });

  test("keeps a zero coordinate: the equator and the prime meridian are places", () => {
    const positions = SignalKHelper.positionsFromHistory(
      response([
        ["2026-05-21T13:00:00Z", 3.1, [0, 0]],
        ["2026-05-21T13:01:00Z", 3.1, { latitude: 51.48, longitude: 0 }],
      ]),
    );
    assert.deepEqual(
      positions.map((p) => [p.latitude, p.longitude]),
      [
        [0, 0],
        [51.48, 0],
      ],
    );
  });

  test("skips buckets without a fix and values that are not a position", () => {
    const positions = SignalKHelper.positionsFromHistory(
      response([
        ["2026-05-21T13:00:00Z", 3.1, null],
        ["2026-05-21T13:01:00Z", 3.1, [20.743]],
        ["2026-05-21T13:02:00Z", 3.1, [NaN, 38.374]],
        ["2026-05-21T13:03:00Z", 3.1, { latitude: "38.374", longitude: 20.743 }],
        ["2026-05-21T13:04:00Z", 3.1, [20.743, 38.374]],
      ]),
    );
    assert.deepEqual(positions, [
      { time: "2026-05-21T13:04:00Z", latitude: 38.374, longitude: 20.743 },
    ]);
  });

  test("reads the position column wherever it sits, and nothing without one", () => {
    assert.deepEqual(
      SignalKHelper.positionsFromHistory({
        values: [{ path: "navigation.speedOverGround", method: "average" }],
        data: [["2026-05-21T13:00:00Z", 3.1]],
      }),
      [],
    );
    assert.deepEqual(SignalKHelper.positionsFromHistory(null), []);
  });
});
