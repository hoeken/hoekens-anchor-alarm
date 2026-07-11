import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GlitchFilter, GLITCH_ACCEPT_LIMIT, describeGlitch } from "../shared/glitch-filter.js";
import { ANCHOR, vesselAt } from "./helpers.js";

// Fixes one second apart make the implied speed numerically equal to the
// distance moved in meters, which keeps the expectations easy to read.
const SEC = 1000;

describe("GlitchFilter", () => {
  test("disabled (speed 0, the default) accepts everything", () => {
    const filter = new GlitchFilter();
    assert.equal(filter.check(ANCHOR, 0).accepted, true);
    // A 5 km jump in one second — plainly a glitch, but the filter is off.
    assert.equal(filter.check(vesselAt(ANCHOR, 5000, 0), SEC).accepted, true);
    // Even garbage passes through untouched when disabled.
    assert.equal(filter.check(null, 2 * SEC).accepted, true);
  });

  test("the first fix is always accepted", () => {
    const filter = new GlitchFilter(2);
    const result = filter.check(ANCHOR, 0);
    assert.equal(result.accepted, true);
    assert.equal(result.speed, null);
  });

  test("accepts moves at or under the limit and reports the speed", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    const result = filter.check(vesselAt(ANCHOR, 1.5, 0), SEC);
    assert.equal(result.accepted, true);
    assert.ok(Math.abs(result.speed - 1.5) < 0.01);
    assert.ok(!result.limitAccepted);
  });

  test("rejects a jump over the limit and keeps the last good fix", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    const result = filter.check(vesselAt(ANCHOR, 500, 0), SEC);
    assert.equal(result.accepted, false);
    assert.ok(Math.abs(result.speed - 500) < 1);
    assert.equal(result.glitches, 1);
    // The spike did not become the baseline.
    assert.equal(filter.lastGood.latitude, ANCHOR.latitude);
    assert.equal(filter.lastGood.longitude, ANCHOR.longitude);
  });

  test("judges the fix after a spike against the pre-spike position", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    filter.check(vesselAt(ANCHOR, 500, 0), SEC); // spike, rejected
    // Two seconds after the baseline, 2 m away from it: 1 m/s. Accepted even
    // though it is 500 m from the rejected spike.
    const result = filter.check(vesselAt(ANCHOR, 2, 90), 2 * SEC);
    assert.equal(result.accepted, true);
    assert.equal(filter.glitches, 0);
  });

  test("accepts after GLITCH_ACCEPT_LIMIT consecutive rejections", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    // A vessel genuinely doing ~100 m/s away from the baseline: every fix
    // looks like a glitch until the limit concedes it's real.
    for (let i = 1; i < GLITCH_ACCEPT_LIMIT; i++) {
      const fix = vesselAt(ANCHOR, 100 * i, 0);
      assert.equal(filter.check(fix, i * SEC).accepted, false, `fix ${i}`);
    }
    const final = vesselAt(ANCHOR, 100 * GLITCH_ACCEPT_LIMIT, 0);
    const result = filter.check(final, GLITCH_ACCEPT_LIMIT * SEC);
    assert.equal(result.accepted, true);
    assert.equal(result.limitAccepted, true);
    // The accepted fix becomes the new baseline and the run counter resets.
    assert.equal(filter.glitches, 0);
    assert.ok(Math.abs(filter.lastGood.latitude - final.latitude) < 1e-9);
  });

  test("an accepted fix resets the run counter", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    // Nine rejections — one short of the acceptance limit...
    for (let i = 1; i < GLITCH_ACCEPT_LIMIT; i++)
      filter.check(vesselAt(ANCHOR, 500, 0), i * SEC);
    // ...then a good fix near the baseline resets the count...
    const good = filter.check(vesselAt(ANCHOR, 1, 0), GLITCH_ACCEPT_LIMIT * SEC);
    assert.equal(good.accepted, true);
    // ...so the next spike is rejection #1, not an auto-accepted #10.
    const spike = filter.check(
      vesselAt(ANCHOR, 500, 0),
      (GLITCH_ACCEPT_LIMIT + 1) * SEC,
    );
    assert.equal(spike.accepted, false);
    assert.equal(filter.glitches, 1);
  });

  test("a repeated timestamp cannot make the speed infinite", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    // Same instant, 100 m away: clamped interval yields a huge finite speed.
    const jump = filter.check(vesselAt(ANCHOR, 100, 0), 0);
    assert.equal(jump.accepted, false);
    assert.ok(Number.isFinite(jump.speed));
    // Same instant, same place: zero distance is still zero speed.
    const dup = filter.check(ANCHOR, 0);
    assert.equal(dup.accepted, true);
  });

  test("rejects unusable positions when enabled, without touching the baseline", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    const result = filter.check({ latitude: NaN, longitude: 1 }, SEC);
    assert.equal(result.accepted, false);
    assert.equal(result.speed, null);
    assert.equal(filter.lastGood.latitude, ANCHOR.latitude);
  });

  test("while disabled it still tracks the stream as a baseline for enabling live", () => {
    const filter = new GlitchFilter(0);
    filter.check(ANCHOR, 0);
    filter.setMaxSpeed(2);
    // First fix after enabling is judged against the fix seen while disabled.
    const result = filter.check(vesselAt(ANCHOR, 500, 0), SEC);
    assert.equal(result.accepted, false);
  });

  test("setMaxSpeed(0) disables the filter live", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    filter.setMaxSpeed(0);
    assert.equal(filter.check(vesselAt(ANCHOR, 5000, 0), SEC).accepted, true);
  });

  test("describeGlitch() reports the fix, implied speed, baseline and run count", () => {
    const filter = new GlitchFilter(2);
    filter.check({ latitude: 37.8, longitude: -122.4 }, 0);
    const spike = vesselAt(ANCHOR, 500, 0);
    const result = filter.check(spike, SEC);
    const text = describeGlitch(filter, result, spike);
    assert.match(text, /^\d+\.\d{6},-\d+\.\d{6} — \d+\.\d m\/s from last good 37\.800000,-122\.400000 \(glitch #1 in a row\)$/);
  });

  test("describeGlitch() tolerates an unusable fix", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    const result = filter.check(null, SEC);
    const text = describeGlitch(filter, result, null);
    assert.match(text, /unusable fix/);
    assert.match(text, /glitch #0/); // unusable fixes don't extend the run
  });

  test("reset() forgets the baseline and the run counter", () => {
    const filter = new GlitchFilter(2);
    filter.check(ANCHOR, 0);
    filter.check(vesselAt(ANCHOR, 500, 0), SEC);
    filter.reset();
    assert.equal(filter.lastGood, null);
    assert.equal(filter.glitches, 0);
    // Post-reset the next fix is a fresh first fix.
    assert.equal(filter.check(vesselAt(ANCHOR, 500, 0), 2 * SEC).accepted, true);
  });
});
