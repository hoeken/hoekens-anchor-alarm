import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SessionLog } from "../src/session-log.js";
import { createMockApp } from "./mockApp.js";

const POSITION = { latitude: 12.5, longitude: -61.4 };
const ZONE = { type: "circle", radius: 50 };

describe("SessionLog", () => {
  let mock;
  let log;

  beforeEach(() => {
    mock = createMockApp();
    log = new SessionLog(mock.app);
  });

  afterEach(() => {
    mock.cleanupDataDir();
  });

  test("starts empty on a fresh data dir", () => {
    assert.deepEqual(log.all(), []);
    assert.equal(log.current(), null);
  });

  test("start records a session with droppedAt and no raisedAt", () => {
    log.start(POSITION, ZONE);
    const open = log.current();
    assert.ok(open);
    assert.ok(open.id);
    assert.ok(Date.parse(open.droppedAt));
    assert.equal(open.raisedAt, undefined);
    assert.deepEqual(open.position, POSITION);
    assert.deepEqual(open.zone, ZONE);
  });

  test("end stamps raisedAt and closes the session", () => {
    log.start(POSITION, ZONE);
    log.end();
    assert.equal(log.current(), null);
    const [session] = log.all();
    assert.ok(Date.parse(session.raisedAt));
  });

  test("end without an open session is a no-op", () => {
    log.end();
    assert.deepEqual(log.all(), []);
  });

  test("re-drop closes the previous open session so sessions never overlap", () => {
    log.start(POSITION, ZONE);
    log.start({ latitude: 13, longitude: -61 }, ZONE);
    const sessions = log.all(); // newest first
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].raisedAt, undefined);
    assert.ok(Date.parse(sessions[1].raisedAt));
  });

  test("updateZone rewrites the open session's zone only", () => {
    log.start(POSITION, ZONE);
    log.updateZone({ type: "circle", radius: 80 });
    assert.equal(log.current().zone.radius, 80);
    log.end();
    log.updateZone({ type: "circle", radius: 99 });
    assert.equal(log.all()[0].zone.radius, 80);
  });

  test("persists across instances (survives a plugin restart)", () => {
    log.start(POSITION, ZONE);
    const reloaded = new SessionLog(mock.app);
    const open = reloaded.current();
    assert.ok(open);
    assert.deepEqual(open.position, POSITION);
  });

  test("tolerates a corrupt sessions file by starting over", () => {
    fs.writeFileSync(log.filePath(), "{not json");
    assert.deepEqual(log.all(), []);
    log.start(POSITION, ZONE);
    assert.ok(log.current());
  });

  test("all() returns newest first", () => {
    log.start(POSITION, ZONE);
    log.end();
    log.start({ latitude: 14, longitude: -60 }, ZONE);
    const sessions = log.all();
    assert.equal(sessions[0].position.latitude, 14);
    assert.equal(sessions[1].position.latitude, 12.5);
  });

  describe("reconcile", () => {
    test("watching with no open session opens an estimated one", () => {
      log.reconcile(true, POSITION, ZONE);
      const open = log.current();
      assert.ok(open);
      assert.equal(open.droppedAtEstimated, true);
      assert.deepEqual(open.position, POSITION);
    });

    test("not watching with an open session closes it as estimated", () => {
      log.start(POSITION, ZONE);
      log.reconcile(false);
      assert.equal(log.current(), null);
      const [session] = log.all();
      assert.ok(Date.parse(session.raisedAt));
      assert.equal(session.raisedAtEstimated, true);
    });

    test("in-sync states are left untouched", () => {
      log.start(POSITION, ZONE);
      log.reconcile(true, POSITION, ZONE);
      assert.equal(log.all().length, 1);
      assert.equal(log.current().droppedAtEstimated, undefined);

      log.end();
      log.reconcile(false);
      assert.equal(log.all().length, 1);
      assert.equal(log.all()[0].raisedAtEstimated, undefined);
    });
  });

  test("remove deletes by id and reports unknown ids", () => {
    log.start(POSITION, ZONE);
    const { id } = log.current();
    assert.equal(log.remove("nope"), false);
    assert.equal(log.remove(id), true);
    assert.deepEqual(log.all(), []);
  });

  test("a failed write reports through app.error instead of throwing", () => {
    log.start(POSITION, ZONE);
    // Make the data dir unwritable by replacing it with a file path target.
    log.filePath = () => "/nonexistent-dir/anchor-sessions.json";
    log.end();
    assert.ok(mock.calls.errors.length > 0);
  });
});
