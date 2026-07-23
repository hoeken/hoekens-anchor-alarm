import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { register } from "../src/http-routes.js";
import { UiConfigStore } from "../src/ui-config.js";
import { ValidationError, StateError } from "../src/errors.js";
import { createMockApp } from "./mockApp.js";

// Router stub that captures handlers by method + path so tests can invoke them.
function fakeRouter() {
  const handlers = { post: {}, get: {}, put: {}, delete: {} };
  return {
    handlers,
    post: (path, fn) => {
      handlers.post[path] = fn;
    },
    get: (path, fn) => {
      handlers.get[path] = fn;
    },
    put: (path, fn) => {
      handlers.put[path] = fn;
    },
    delete: (path, fn) => {
      handlers.delete[path] = fn;
    },
  };
}

// Minimal Express-style response recorder. `set` records headers; `send`
// captures a non-JSON body (used by GET /icon to return raw image bytes).
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    sent: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
  };
}

// 1x1 PNG (magic bytes 89 50 4E 47 …) — enough for sniffIconType to accept.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]);

describe("http-routes register()", () => {
  let harness;
  let app;
  let router;
  let plugin;

  beforeEach(() => {
    harness = createMockApp();
    app = harness.app;
    router = fakeRouter();
    plugin = {
      configuration: {},
      saveCount: 0,
      savePluginOptions() {
        this.saveCount++;
      },
      uiConfigStore: new UiConfigStore(app),
    };
  });

  afterEach(() => {
    harness.cleanupDataDir();
  });

  function wire() {
    register(app, plugin, router);
  }

  test("exposes the OpenAPI document via plugin.getOpenApi", () => {
    wire();
    assert.equal(typeof plugin.getOpenApi, "function");
    assert.ok(plugin.getOpenApi());
  });

  describe("POST /dropAnchor", () => {
    test("success returns 200 COMPLETED and forwards position + zone", () => {
      let received;
      plugin.dropAnchor = (args) => {
        received = args;
      };
      wire();
      const res = fakeRes();
      router.handlers.post["/dropAnchor"](
        { body: { position: { latitude: 1, longitude: 2 }, zone: { type: "circle" } } },
        res,
      );
      assert.deepEqual(received, {
        position: { latitude: 1, longitude: 2 },
        zone: { type: "circle" },
      });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { statusCode: 200, state: "COMPLETED" });
    });

    test("a ValidationError maps to 403 FAILED with the message", () => {
      plugin.dropAnchor = () => {
        throw new ValidationError("position required");
      };
      wire();
      const res = fakeRes();
      router.handlers.post["/dropAnchor"]({ body: {} }, res);
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.body, {
        statusCode: 403,
        state: "FAILED",
        message: "position required",
      });
    });

    test("a non-AnchorError maps to 500", () => {
      plugin.dropAnchor = () => {
        throw new Error("boom");
      };
      wire();
      const res = fakeRes();
      router.handlers.post["/dropAnchor"]({ body: {} }, res);
      assert.equal(res.statusCode, 500);
      assert.equal(res.body.state, "FAILED");
    });
  });

  describe("POST /setZone", () => {
    test("forwards the zone and returns 200", () => {
      let received;
      plugin.setZone = (zone) => {
        received = zone;
      };
      wire();
      const res = fakeRes();
      router.handlers.post["/setZone"]({ body: { zone: { type: "sector" } } }, res);
      assert.deepEqual(received, { type: "sector" });
      assert.equal(res.statusCode, 200);
    });

    test("a StateError maps to 403", () => {
      plugin.setZone = () => {
        throw new StateError("no anchor is currently dropped");
      };
      wire();
      const res = fakeRes();
      router.handlers.post["/setZone"]({ body: {} }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message, "no anchor is currently dropped");
    });
  });

  describe("POST /raiseAnchor", () => {
    test("calls plugin.raiseAnchor and returns 200", () => {
      let called = false;
      plugin.raiseAnchor = () => {
        called = true;
      };
      wire();
      const res = fakeRes();
      router.handlers.post["/raiseAnchor"]({ body: {} }, res);
      assert.equal(called, true);
      assert.equal(res.statusCode, 200);
    });
  });

  describe("sessions routes", () => {
    test("GET /sessions returns the log newest first", () => {
      plugin.sessionLog = {
        all: () => [{ id: "b" }, { id: "a" }],
      };
      wire();
      const res = fakeRes();
      router.handlers.get["/sessions"]({}, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { sessions: [{ id: "b" }, { id: "a" }] });
    });

    test("DELETE /sessions/:id returns 200 when removed", () => {
      let removed;
      plugin.sessionLog = {
        remove: (id) => {
          removed = id;
          return true;
        },
      };
      wire();
      const res = fakeRes();
      router.handlers.delete["/sessions/:id"]({ params: { id: "abc" } }, res);
      assert.equal(removed, "abc");
      assert.equal(res.statusCode, 200);
    });

    test("DELETE /sessions/:id returns 404 for an unknown id", () => {
      plugin.sessionLog = { remove: () => false };
      wire();
      const res = fakeRes();
      router.handlers.delete["/sessions/:id"]({ params: { id: "nope" } }, res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.state, "FAILED");
    });
  });

  describe("GET /ui-config", () => {
    // Requests carry identity the way SignalK's security middleware provides
    // it: a principal whose identifier is the username / device clientId.
    const asUser = (identifier) => ({ skPrincipal: { identifier } });

    test("an anonymous request gets the full default preference set", () => {
      wire();
      const res = fakeRes();
      router.handlers.get["/ui-config"]({}, res);
      assert.equal(res.body.defaultBasemap, "Satellite");
      assert.equal(res.body.enableTidePanel, true);
      assert.equal("zone" in res.body, false);
      assert.equal("state" in res.body, false);
    });

    test("resolves preferences per identity", () => {
      plugin.uiConfigStore.save("bob", { defaultBasemap: "Blank" });
      wire();

      const bob = fakeRes();
      router.handlers.get["/ui-config"](asUser("bob"), bob);
      assert.equal(bob.body.defaultBasemap, "Blank");

      const alice = fakeRes();
      router.handlers.get["/ui-config"](asUser("alice"), alice);
      assert.equal(alice.body.defaultBasemap, "Satellite");
    });

    test("glitchFilterSpeed rides along read-only from the plugin config", () => {
      plugin.configuration = { glitchFilterSpeed: 3.5 };
      wire();
      const res = fakeRes();
      router.handlers.get["/ui-config"]({}, res);
      assert.equal(res.body.glitchFilterSpeed, 3.5);
    });

    test("tolerates a missing configuration", () => {
      plugin.configuration = undefined;
      wire();
      const res = fakeRes();
      assert.doesNotThrow(() => router.handlers.get["/ui-config"]({}, res));
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.glitchFilterSpeed, 0);
    });
  });

  describe("POST /ui-config", () => {
    const asUser = (identifier, body) => ({
      skPrincipal: { identifier },
      body,
    });

    test("coerces, saves to the identity's store, and echoes updates", () => {
      wire();
      const res = fakeRes();
      router.handlers.post["/ui-config"](
        asUser("bob", { defaultBasemap: "OpenStreetMap", fleetFilterRadius: "250" }),
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.config, {
        defaultBasemap: "OpenStreetMap",
        fleetFilterRadius: 250,
      });
      assert.equal(
        plugin.uiConfigStore.resolve("bob").fleetFilterRadius,
        250,
      );
      // Preferences no longer touch the plugin config.
      assert.equal(plugin.configuration.defaultBasemap, undefined);
      assert.equal(plugin.saveCount, 0);
    });

    test("a save only affects the posting identity", () => {
      wire();
      router.handlers.post["/ui-config"](
        asUser("bob", { enableTidePanel: false }),
        fakeRes(),
      );
      assert.equal(plugin.uiConfigStore.resolve("bob").enableTidePanel, false);
      assert.equal(plugin.uiConfigStore.resolve("alice").enableTidePanel, true);
    });

    test("boat-level keys in the body are ignored, not saved", () => {
      wire();
      const res = fakeRes();
      router.handlers.post["/ui-config"](
        asUser("bob", { glitchFilterSpeed: 9, enableWindPanel: false }),
        res,
      );
      assert.deepEqual(res.body.config, { enableWindPanel: false });
      assert.equal(plugin.configuration.glitchFilterSpeed, undefined);
    });

    test("an anonymous save (security disabled) lands in the shared bucket", () => {
      wire();
      router.handlers.post["/ui-config"](
        { body: { enableScopePanel: false } },
        fakeRes(),
      );
      assert.equal(plugin.uiConfigStore.resolve(null).enableScopePanel, false);

      const res = fakeRes();
      router.handlers.get["/ui-config"]({}, res);
      assert.equal(res.body.enableScopePanel, false);
    });

    test("rejects an invalid value with 403 and stores nothing", () => {
      wire();
      const res = fakeRes();
      router.handlers.post["/ui-config"](
        asUser("bob", { defaultBasemap: "CARRIER_PIGEON" }),
        res,
      );
      assert.equal(res.statusCode, 403);
      assert.equal(
        fs.existsSync(path.join(harness.dataDir(), "ui-config")),
        false,
      );
    });

    test("reports hasCustomIcon=false when no icon file exists", () => {
      wire();
      const res = fakeRes();
      router.handlers.get["/ui-config"]({}, res);
      assert.equal(res.body.hasCustomIcon, false);
    });
  });

  describe("boat icon /icon", () => {
    // The PUT/GET/DELETE handlers do file I/O against harness.dataDir().
    // readBodyBytes accepts a pre-buffered Buffer as req.body, so tests pass
    // bytes directly without faking a request stream.
    function putIcon(body, headers = {}) {
      const res = fakeRes();
      // The PUT handler is async (reads the body via a promise); return the
      // promise so tests can await it.
      const ret = router.handlers.put["/icon"]({ body, headers }, res);
      return Promise.resolve(ret).then(() => res);
    }

    test("PUT stores a valid PNG and flips hasCustomIcon", async () => {
      wire();
      const putRes = await putIcon(PNG_BYTES);
      assert.equal(putRes.statusCode, 200);
      assert.equal(putRes.body.state, "COMPLETED");

      const stored = fs
        .readdirSync(harness.dataDir())
        .filter((f) => f.startsWith("boat-icon."));
      assert.deepEqual(stored, ["boat-icon.png"]);

      const cfgRes = fakeRes();
      router.handlers.get["/ui-config"]({}, cfgRes);
      assert.equal(cfgRes.body.hasCustomIcon, true);
    });

    test("GET serves the stored bytes with the right content-type", async () => {
      wire();
      await putIcon(PNG_BYTES);

      const res = fakeRes();
      router.handlers.get["/icon"]({}, res);
      assert.equal(res.headers["Content-Type"], "image/png");
      assert.ok(Buffer.isBuffer(res.sent));
      assert.ok(res.sent.equals(PNG_BYTES));
    });

    test("GET returns 404 when no icon is set", () => {
      wire();
      const res = fakeRes();
      router.handlers.get["/icon"]({}, res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.state, "FAILED");
    });

    test("PUT rejects an oversized image with 413 and stores nothing", async () => {
      wire();
      const big = Buffer.concat([PNG_BYTES, Buffer.alloc(500 * 1024)]);
      const res = await putIcon(big);
      assert.equal(res.statusCode, 413);
      assert.equal(
        fs.existsSync(path.join(harness.dataDir(), "boat-icon.png")),
        false,
      );
    });

    test("PUT rejects an oversized streamed body with 413 without destroying the request", async () => {
      wire();
      // The browser streams the body (no pre-buffered req.body), so fake a
      // request stream. The handler must drain it to a clean 413 rather than
      // calling req.destroy(), which would surface as "Failed to fetch".
      const req = new EventEmitter();
      req.headers = {};
      req.destroy = () => {
        req.destroyed = true;
      };
      const res = fakeRes();
      router.handlers.put["/icon"](req, res);
      // Emit more than the cap across two chunks, then end the stream.
      req.emit("data", PNG_BYTES);
      req.emit("data", Buffer.alloc(500 * 1024));
      req.emit("end");
      // Let the handler's promise chain settle (drain → reject → 413 response).
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(res.statusCode, 413);
      assert.notEqual(req.destroyed, true);
      assert.equal(
        fs.existsSync(path.join(harness.dataDir(), "boat-icon.png")),
        false,
      );
    });

    test("PUT rejects a non-image body with 415", async () => {
      wire();
      const res = await putIcon(Buffer.from("not an image at all"));
      assert.equal(res.statusCode, 415);
    });

    test("PUT rejects an empty body with 400", async () => {
      wire();
      const res = await putIcon(Buffer.alloc(0));
      assert.equal(res.statusCode, 400);
    });

    test("PUT replaces an existing icon of a different type", async () => {
      wire();
      const gif = Buffer.from("GIF89a", "latin1");
      await putIcon(gif);
      await putIcon(PNG_BYTES);
      const stored = fs
        .readdirSync(harness.dataDir())
        .filter((f) => f.startsWith("boat-icon."));
      assert.deepEqual(stored, ["boat-icon.png"]);
    });

    test("DELETE removes the icon and is idempotent", async () => {
      wire();
      await putIcon(PNG_BYTES);

      const del1 = fakeRes();
      router.handlers.delete["/icon"]({}, del1);
      assert.equal(del1.statusCode, 200);
      assert.equal(
        fs.existsSync(path.join(harness.dataDir(), "boat-icon.png")),
        false,
      );

      // A second delete with nothing to remove still succeeds.
      const del2 = fakeRes();
      router.handlers.delete["/icon"]({}, del2);
      assert.equal(del2.statusCode, 200);

      const cfgRes = fakeRes();
      router.handlers.get["/ui-config"]({}, cfgRes);
      assert.equal(cfgRes.body.hasCustomIcon, false);
    });
  });
});
