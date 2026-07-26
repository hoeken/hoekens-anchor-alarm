// The shared HUD field renderer: live values at full strength, stale values
// dimmed (.stale), missing values as a dimmed placeholder (.missing). The
// helper only touches textContent/classList, so a fake element suffices.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setFieldText, fieldIsStale } from "../ui/js/hud/missingField.js";

const FRESH = { value: 5.2, timestamp: new Date().toISOString() };
const STALE = { value: 5.2, timestamp: "2020-01-01T00:00:00.000Z" };

function fakeEl() {
  const classes = new Set();
  return {
    textContent: "",
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
  };
}

describe("fieldIsStale()", () => {
  test("fresh envelope is not stale", () => {
    assert.equal(fieldIsStale(FRESH), false);
  });

  test("old envelope is stale", () => {
    assert.equal(fieldIsStale(STALE), true);
  });

  test("an envelope with no timestamp can't be verified live — stale", () => {
    assert.equal(fieldIsStale({ value: 5.2 }), true);
  });

  test("missing envelopes are the missing state's problem, not staleness", () => {
    assert.equal(fieldIsStale(null), false);
    assert.equal(fieldIsStale([null, undefined]), false);
  });

  test("any stale input dims a derived field", () => {
    assert.equal(fieldIsStale([FRESH, STALE]), true);
    assert.equal(fieldIsStale([FRESH, FRESH]), false);
  });
});

describe("setFieldText()", () => {
  test("live value renders at full strength", () => {
    const el = fakeEl();
    setFieldText(el, "5.2 m", FRESH);
    assert.equal(el.textContent, "5.2 m");
    assert.equal(el.classList.contains("missing"), false);
    assert.equal(el.classList.contains("stale"), false);
  });

  test("stale value keeps its text but dims", () => {
    const el = fakeEl();
    setFieldText(el, "5.2 m", STALE);
    assert.equal(el.textContent, "5.2 m");
    assert.equal(el.classList.contains("stale"), true);
    assert.equal(el.classList.contains("missing"), false);
  });

  test("missing value renders the placeholder", () => {
    const el = fakeEl();
    setFieldText(el, "");
    assert.equal(el.textContent, "~");
    assert.equal(el.classList.contains("missing"), true);
    assert.equal(el.classList.contains("stale"), false);
  });

  test("no envelope means no staleness judgement", () => {
    const el = fakeEl();
    setFieldText(el, "1.5 m");
    assert.equal(el.classList.contains("stale"), false);
  });

  test("transitions clear the previous state's class", () => {
    const el = fakeEl();
    setFieldText(el, "5.2 m", STALE);
    setFieldText(el, "");
    assert.equal(el.classList.contains("stale"), false);
    assert.equal(el.classList.contains("missing"), true);

    setFieldText(el, "4.8 m", FRESH);
    assert.equal(el.textContent, "4.8 m");
    assert.equal(el.classList.contains("missing"), false);
    assert.equal(el.classList.contains("stale"), false);
  });
});
