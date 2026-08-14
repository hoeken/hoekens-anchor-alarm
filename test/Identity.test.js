import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Identity } from "../ui/js/Identity.js";

// The payloads /skServer/loginStatus actually returns, per security strategy.
const ADMIN = {
  status: "loggedIn",
  readOnlyAccess: true,
  authenticationRequired: true,
  allowNewUserRegistration: false,
  allowDeviceAccessRequests: true,
  userLevel: "admin",
  username: "admin",
  securityWasEnabled: false,
};

const ANONYMOUS = {
  status: "notLoggedIn",
  readOnlyAccess: true,
  authenticationRequired: true,
  allowNewUserRegistration: false,
  allowDeviceAccessRequests: true,
  securityWasEnabled: false,
};

// dummysecurity, i.e. the server has no security configured at all.
const SECURITY_DISABLED = {
  status: "notLoggedIn",
  readOnlyAccess: false,
  authenticationRequired: false,
};

describe("Identity", () => {
  describe("logged-in users", () => {
    test("an admin can do everything", () => {
      const identity = new Identity(ADMIN);
      assert.equal(identity.loggedIn, true);
      assert.equal(identity.username, "admin");
      assert.equal(identity.level, "admin");
      assert.ok(identity.canRead());
      assert.ok(identity.canWrite());
      assert.ok(identity.canAdmin());
    });

    test("a readwrite user can work the anchor but not the boat icon", () => {
      const identity = new Identity({
        ...ADMIN,
        userLevel: "readwrite",
        username: "crew",
      });
      assert.equal(identity.level, "readwrite");
      assert.ok(identity.canWrite());
      assert.equal(identity.canAdmin(), false);
    });

    test("a readonly user can only look", () => {
      const identity = new Identity({
        ...ADMIN,
        userLevel: "readonly",
        username: "guest",
      });
      assert.ok(identity.canRead());
      assert.equal(identity.canWrite(), false);
    });

    test("an unknown or missing userLevel falls back to readonly", () => {
      for (const userLevel of [undefined, "captain"]) {
        const identity = new Identity({ ...ADMIN, userLevel });
        assert.equal(identity.level, "readonly");
        assert.equal(identity.canWrite(), false);
      }
    });
  });

  describe("anonymous sessions", () => {
    test("read-only access allowed means reads work, writes don't", () => {
      const identity = new Identity(ANONYMOUS);
      assert.equal(identity.loggedIn, false);
      assert.equal(identity.username, null);
      assert.equal(identity.level, "readonly");
      assert.ok(identity.canRead());
      assert.equal(identity.canWrite(), false);
    });

    test("without read-only access nothing is permitted", () => {
      const identity = new Identity({ ...ANONYMOUS, readOnlyAccess: false });
      assert.equal(identity.level, "none");
      assert.equal(identity.canRead(), false);
      assert.equal(identity.canWrite(), false);
      assert.equal(identity.canAdmin(), false);
    });

    test("a username is ignored unless the session is logged in", () => {
      const identity = new Identity({ ...ANONYMOUS, username: "admin" });
      assert.equal(identity.username, null);
    });
  });

  describe("security disabled", () => {
    // The trap this class exists for: the payload says notLoggedIn, but every
    // route is served unconditionally, so the UI must offer the full control set.
    test("nobody is logged in yet everything is permitted", () => {
      const identity = new Identity(SECURITY_DISABLED);
      assert.equal(identity.loggedIn, false);
      assert.equal(identity.level, "admin");
      assert.ok(identity.canRead());
      assert.ok(identity.canWrite());
      assert.ok(identity.canAdmin());
    });

    test("there is no login to offer", () => {
      assert.equal(new Identity(SECURITY_DISABLED).authRequired, false);
      assert.equal(new Identity(ANONYMOUS).authRequired, true);
    });
  });

  describe("defaults", () => {
    test("anonymous() permits nothing", () => {
      const identity = Identity.anonymous();
      assert.equal(identity.level, "none");
      assert.equal(identity.canRead(), false);
      assert.equal(identity.canWrite(), false);
    });

    test("unrestricted() permits everything", () => {
      assert.ok(Identity.unrestricted().canAdmin());
    });

    test("an empty payload is treated as a security-enabled server", () => {
      // A server too old to report authenticationRequired only ever shipped
      // the security-enabled strategy, so absent must not read as "no security".
      const identity = new Identity({});
      assert.equal(identity.authRequired, true);
      assert.equal(identity.level, "none");
    });
  });
});
