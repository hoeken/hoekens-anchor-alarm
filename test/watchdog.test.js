import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Watchdog } from "../src/watchdog.js";

describe("Watchdog", () => {
  test("fires onTimeout once the timeout elapses", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let fired = 0;
    const dog = new Watchdog(1000, () => fired++);
    dog.start();

    t.mock.timers.tick(999);
    assert.equal(fired, 0);
    t.mock.timers.tick(1);
    assert.equal(fired, 1);
  });

  test("stop() cancels a pending timeout", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let fired = 0;
    const dog = new Watchdog(1000, () => fired++);
    dog.start();
    dog.stop();

    t.mock.timers.tick(5000);
    assert.equal(fired, 0);
  });

  test("reset() restarts the countdown from zero", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let fired = 0;
    const dog = new Watchdog(1000, () => fired++);
    dog.start();

    t.mock.timers.tick(800);
    dog.reset();
    t.mock.timers.tick(800); // 800 since reset — not yet 1000
    assert.equal(fired, 0);
    t.mock.timers.tick(200); // now 1000 since reset
    assert.equal(fired, 1);
  });

  test("calling start() twice does not double-fire", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let fired = 0;
    const dog = new Watchdog(1000, () => fired++);
    dog.start();
    dog.start();

    t.mock.timers.tick(2000);
    assert.equal(fired, 1);
  });

  test("stop() is safe when never started", () => {
    const dog = new Watchdog(1000, () => {});
    assert.doesNotThrow(() => dog.stop());
  });
});
