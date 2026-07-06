import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "../src/http-routes.js";
import { ValidationError, StateError } from "../src/errors.js";
import { createMockApp } from "./mockApp.js";

// Router stub that captures handlers by method + path so tests can invoke them.
function fakeRouter() {
  const handlers = { post: {}, get: {} };
  return {
    handlers,
    post: (path, fn) => {
      handlers.post[path] = fn;
    },
    get: (path, fn) => {
      handlers.get[path] = fn;
    },
  };
}

// Minimal Express-style response recorder.
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
  };
}

describe("http-routes register()", () => {
  let app;
  let router;
  let plugin;

  beforeEach(() => {
    app = createMockApp().app;
    router = fakeRouter();
    plugin = {
      configuration: {},
      saveCount: 0,
      savePluginOptions() {
        this.saveCount++;
      },
    };
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

  describe("GET /ui-config", () => {
    test("returns the whitelisted projection of the config", () => {
      plugin.configuration = {
        defaultBasemap: "Satellite",
        zone: "secret",
        state: "emergency",
      };
      wire();
      const res = fakeRes();
      router.handlers.get["/ui-config"]({}, res);
      assert.equal(res.body.defaultBasemap, "Satellite");
      assert.equal("zone" in res.body, false);
      assert.equal("state" in res.body, false);
    });

    test("tolerates a missing configuration", () => {
      plugin.configuration = undefined;
      wire();
      const res = fakeRes();
      assert.doesNotThrow(() => router.handlers.get["/ui-config"]({}, res));
      assert.equal(res.statusCode, 200);
    });
  });

  describe("POST /ui-config", () => {
    test("coerces, assigns onto the config, saves, and echoes updates", () => {
      plugin.configuration = {};
      wire();
      const res = fakeRes();
      router.handlers.post["/ui-config"](
        { body: { defaultBasemap: "OpenStreetMap", fleetFilterRadius: "250" } },
        res,
      );
      assert.equal(plugin.configuration.defaultBasemap, "OpenStreetMap");
      assert.equal(plugin.configuration.fleetFilterRadius, 250);
      assert.equal(plugin.saveCount, 1);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.config, {
        defaultBasemap: "OpenStreetMap",
        fleetFilterRadius: 250,
      });
    });

    test("rejects an invalid value with 403 and does not save", () => {
      plugin.configuration = {};
      wire();
      const res = fakeRes();
      router.handlers.post["/ui-config"](
        { body: { defaultBasemap: "CARRIER_PIGEON" } },
        res,
      );
      assert.equal(res.statusCode, 403);
      assert.equal(plugin.saveCount, 0);
    });

    test("initializes configuration when it was undefined", () => {
      plugin.configuration = undefined;
      wire();
      const res = fakeRes();
      router.handlers.post["/ui-config"](
        { body: { enableTidePanel: false } },
        res,
      );
      assert.equal(plugin.configuration.enableTidePanel, false);
      assert.equal(res.statusCode, 200);
    });
  });
});
