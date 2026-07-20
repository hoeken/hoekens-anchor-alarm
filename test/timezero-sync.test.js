import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  toMercator,
  fromMercator,
  encodeGeometry,
  decodeGeometry,
  buildValues,
  parseValues,
  buildBeacon,
  parseBeacon,
  TimeZeroSync,
} from "../src/timezero-sync.js";

// A minimal app stub: the sync engine only uses debug/error for logging.
const stubApp = () => ({ debug() {}, error() {} });

// Ground-truth samples captured from live TimeZero Professional hardware
// (MASTERCABIN) over the LAN sync protocol. These pin the wire format so a
// regression in the codec is caught immediately.
//
//   50 m anchor:  X'04758FC567F417EB1E00001388'
//   86 m anchor:  X'04758FC567F417EB1E00002169'  (only radius bytes differ)
//
// Both decode to lat -17.658292, lon 177.179795 (Fiji).
const LIVE_BLOB_50M = "04758FC567F417EB1E00001388";
const LIVE_BLOB_86M = "04758FC567F417EB1E00002169";
const LIVE_LAT = -17.658292;
const LIVE_LON = 177.179795;

describe("Mercator projection", () => {
  test("round-trips a position to within a millimetre", () => {
    const merc = toMercator(LIVE_LAT, LIVE_LON);
    const back = fromMercator(merc.x, merc.y);
    assert.ok(Math.abs(back.latitude - LIVE_LAT) < 1e-6);
    assert.ok(Math.abs(back.longitude - LIVE_LON) < 1e-6);
  });

  test("clamps latitude to the projection's valid band", () => {
    // A pole would be y=Infinity; clamping keeps it finite.
    assert.ok(Number.isFinite(toMercator(90, 0).y));
    assert.ok(Number.isFinite(toMercator(-90, 0).y));
  });
});

describe("geometry blob codec", () => {
  test("decodes the live 50 m blob to the captured position and radius", () => {
    const decoded = decodeGeometry(Buffer.from(LIVE_BLOB_50M, "hex"));
    assert.ok(decoded);
    assert.ok(Math.abs(decoded.position.latitude - LIVE_LAT) < 1e-5);
    assert.ok(Math.abs(decoded.position.longitude - LIVE_LON) < 1e-5);
    assert.equal(decoded.radius, 50);
  });

  test("decodes the live 86 m blob (TimeZero stored 85.53 m)", () => {
    const decoded = decodeGeometry(Buffer.from(LIVE_BLOB_86M, "hex"));
    assert.equal(decoded.radius, 85.53);
  });

  test("re-encoding the decoded position reproduces the live bytes", () => {
    const decoded = decodeGeometry(Buffer.from(LIVE_BLOB_50M, "hex"));
    const re = encodeGeometry(decoded.position, 50).toString("hex").toUpperCase();
    assert.equal(re, LIVE_BLOB_50M);
  });

  test("only the radius bytes change between the two live samples", () => {
    // Bytes 0..8 (type + centre) identical; bytes 9..12 (radius) differ.
    assert.equal(LIVE_BLOB_50M.slice(0, 18), LIVE_BLOB_86M.slice(0, 18));
    assert.notEqual(LIVE_BLOB_50M.slice(18), LIVE_BLOB_86M.slice(18));
  });

  test("encodes a circle as a 13-byte, type-4, big-endian blob", () => {
    const buf = encodeGeometry({ latitude: 0, longitude: 0 }, 100);
    assert.equal(buf.length, 13);
    assert.equal(buf.readUInt8(0), 0x04);
    assert.equal(buf.readInt32BE(9), 10000); // 100 m in cm
  });

  test("rejects a null, short, or wrong-type blob", () => {
    assert.equal(decodeGeometry(null), null);
    assert.equal(decodeGeometry(Buffer.alloc(5)), null);
    const wrong = Buffer.alloc(13);
    wrong.writeUInt8(0x02, 0);
    assert.equal(decodeGeometry(wrong), null);
  });
});

describe("Values CSV", () => {
  test("serialises a set anchor with a hex geometry blob", () => {
    const values = buildValues(
      { position: { latitude: LIVE_LAT, longitude: LIVE_LON }, radius: 50 },
      1000000000,
    );
    assert.match(values, /^X'04[0-9A-F]+',\d+,\d+,\d+$/);
    const parsed = parseValues(values);
    assert.equal(parsed.radius, 50);
  });

  test("serialises a raised anchor as NULL geometry", () => {
    const values = buildValues(null, 1000000000);
    assert.match(values, /^NULL,\d+,\d+,\d+$/);
    assert.equal(parseValues(values), null);
  });

  test("parses the live captured Values string", () => {
    const parsed = parseValues(`X'${LIVE_BLOB_50M}',10,837806549,837805913`);
    assert.equal(parsed.radius, 50);
  });

  test("parses NULL geometry as no anchor", () => {
    assert.equal(parseValues("NULL,10,837806549,837805913"), null);
    assert.equal(parseValues("garbage"), null);
    assert.equal(parseValues(undefined), null);
  });

  test("uses the TimeZero epoch (seconds since 1990) for timestamps", () => {
    // Unix 2000-01-01 = 946684800; TZ epoch offset = 631152000.
    const values = buildValues(null, 946684800);
    const tz = Number(values.split(",")[2]);
    assert.equal(tz, 946684800 - 631152000);
  });
});

describe("discovery beacon", () => {
  test("builds a semicolon beacon with our advertised fields", () => {
    const beacon = buildBeacon({
      hostName: "SignalK",
      uuid: "abcd",
      anchorWatchTick: 7,
      visibleHosts: 99,
    });
    const f = beacon.split(";");
    assert.equal(f[0], "TZ Sync 1.0");
    assert.equal(f[1], "SignalK");
    assert.equal(f[2], "TZ iBoat");
    assert.equal(f[8], "99"); // visibleHosts (master election)
    assert.equal(f[13], "22"); // schemaVersion, as TimeZero broadcasts
    assert.equal(f[14], "7"); // anchorWatchTick
  });

  test("round-trips a beacon it built", () => {
    const beacon = buildBeacon({
      hostName: "NAV",
      uuid: "x",
      anchorWatchTick: 42,
      visibleHosts: 3,
    });
    const peer = parseBeacon(beacon, "172.31.3.9");
    assert.equal(peer.name, "NAV");
    assert.equal(peer.canSync, true);
    assert.equal(peer.anchorWatchTick, 42);
    assert.equal(peer.address, "172.31.3.9");
  });

  // A real beacon from a signed-in TZ Professional. The anchor tick lives in
  // field 14 (3151, matching the ChangeTick its AnchorWatch endpoint returned);
  // field 13 is the schema version and stays at 22 across anchor edits.
  test("parses a real signed-in TZ Professional beacon", () => {
    const raw =
      "TZ Sync 1.0;TZPRO-NAVPC;TZ Professional;;user-guid;Cloud;TZPRO-NAVPC/5425c908;35847804;4;1;205253;95;1007586792;22;3151;0;270720187";
    const peer = parseBeacon(raw, "192.168.1.108");
    assert.equal(peer.name, "TZPRO-NAVPC");
    assert.equal(peer.deviceType, "TZ Professional");
    assert.equal(peer.userId, "user-guid");
    assert.equal(peer.canSync, true);
    assert.equal(peer.visibleHosts, 4);
    assert.equal(peer.anchorWatchTick, 3151);
  });

  // The anchor tick is what moves when the operator edits the anchor: across
  // six edits field 14 stepped 3143..3148 while field 13 stayed at 22.
  test("tracks the anchor tick across an edit, ignoring the static field 13", () => {
    const at = (tick) =>
      `TZ Sync 1.0;TZPRO-NAVPC;TZ Professional;;u;Cloud;TZPRO-NAVPC/x;35847804;4;1;205253;95;1007586792;22;${tick};0;0`;
    assert.equal(parseBeacon(at(3143), "1.2.3.4").anchorWatchTick, 3143);
    assert.equal(parseBeacon(at(3148), "1.2.3.4").anchorWatchTick, 3148);
  });

  test("ignores non-TimeZero UDP payloads", () => {
    assert.equal(parseBeacon("not a beacon", "1.2.3.4"), null);
    assert.equal(parseBeacon("", "1.2.3.4"), null);
  });
});

describe("My TIMEZERO user id pairing", () => {
  test("advertises the user id in beacon field 4", () => {
    const f = buildBeacon({
      hostName: "SK",
      uuid: "u",
      userId: "user-123",
    }).split(";");
    assert.equal(f[4], "user-123");
  });

  test("leaves field 4 empty when no user id is configured", () => {
    const f = buildBeacon({ hostName: "SK", uuid: "u" }).split(";");
    assert.equal(f[4], "");
  });

  test("parses a peer's user id out of its beacon", () => {
    const raw =
      "TZ Sync 1.0;NAV;TZ Professional;;user-123;;NAV/uuid;34944412;1;1;10;1;0;5;2;0;0";
    assert.equal(parseBeacon(raw, "192.168.0.9").userId, "user-123");
  });

  describe("isTrustedPeer", () => {
    const seenPeer = (sync, address, userId) =>
      sync.peers.set(address, { address, userId });

    test("always trusts NavNet addresses", () => {
      const sync = new TimeZeroSync(stubApp(), {});
      assert.equal(sync.isTrustedPeer("172.31.3.54"), true);
    });

    test("rejects off-NavNet addresses when no user id is configured", () => {
      const sync = new TimeZeroSync(stubApp(), {});
      assert.equal(sync.isTrustedPeer("192.168.0.9"), false);
    });

    test("trusts an off-NavNet peer that advertised our user id", () => {
      const sync = new TimeZeroSync(stubApp(), { userId: "user-123" });
      seenPeer(sync, "192.168.0.9", "user-123");
      assert.equal(sync.isTrustedPeer("192.168.0.9"), true);
    });

    test("rejects an off-NavNet peer advertising a different user id", () => {
      const sync = new TimeZeroSync(stubApp(), { userId: "user-123" });
      seenPeer(sync, "192.168.0.9", "someone-else");
      assert.equal(sync.isTrustedPeer("192.168.0.9"), false);
    });

    test("rejects an unknown address even with a user id configured", () => {
      const sync = new TimeZeroSync(stubApp(), { userId: "user-123" });
      assert.equal(sync.isTrustedPeer("192.168.0.99"), false);
      assert.equal(sync.isTrustedPeer(""), false);
    });
  });
});

describe("pulling from a peer that advertises a newer anchor", () => {
  // Stand up a stub that answers like TimeZero does, so the pull can be
  // exercised end to end: lock, fetch, release.
  const startPeer = async (anchorValues) => {
    const { createServer } = await import("node:http");
    const seen = [];
    const server = createServer((req, res) => {
      seen.push(req.url.split("?")[0]);
      if (req.url.includes("GetLock")) {
        res.writeHead(202);
        res.end();
      } else if (req.url.includes("ReleaseLock")) {
        res.writeHead(200);
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ChangeTick: 3152, Values: anchorValues }));
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return { server, seen, port: server.address().port };
  };

  test("locks, fetches the anchor, then releases", async () => {
    const peer = await startPeer("X'0400000000000000000000C350',10,0,0");
    try {
      let applied;
      const sync = new TimeZeroSync(stubApp(), {
        onRemoteAnchor: (a) => {
          applied = a;
        },
      });
      // Point the pull at the stub's port rather than TimeZero's fixed one.
      sync._get = (address, path) =>
        new Promise((resolve, reject) => {
          import("node:http").then(({ get }) => {
            const req = get(
              { host: "127.0.0.1", port: peer.port, path },
              (res) => {
                let body = "";
                res.on("data", (c) => (body += c));
                res.on("end", () => resolve({ status: res.statusCode, body }));
              },
            );
            req.on("error", reject);
          });
        });
      sync.anchorTick = 1;
      await sync._pullFrom(
        { address: "127.0.0.1", name: "TZPRO", anchorWatchTick: 3152 },
        1,
      );
      assert.deepEqual(peer.seen, [
        "/LanSynchronizationApi/GetLock",
        "/LanSynchronizationApi/AnchorWatch",
        "/LanSynchronizationApi/ReleaseLock",
      ]);
      assert.ok(applied, "anchor should have been applied");
      assert.equal(applied.radius, 500);
      assert.equal(sync.anchorTick, 3152);
    } finally {
      peer.server.close();
    }
  });

  test("gives up quietly when the peer's lock is held", async () => {
    const sync = new TimeZeroSync(stubApp(), {
      onRemoteAnchor: () => assert.fail("must not apply without the lock"),
    });
    sync._get = async (_a, path) =>
      path.includes("GetLock")
        ? { status: 409, body: "" }
        : { status: 200, body: "{}" };
    sync.anchorTick = 1;
    await sync._pullFrom({ address: "1.2.3.4", name: "TZ", anchorWatchTick: 9 }, 1);
    assert.equal(sync.anchorTick, 1); // unchanged
  });
});

describe("sync lock endpoint", () => {
  // Drive the real request handler over a loopback socket, so the lock
  // behaviour a TimeZero peer would see is what's actually tested.
  const callServed = async (sync, url) => {
    const { createServer, get } = await import("node:http");
    const server = createServer((req, res) => {
      // Force the trust check to pass for loopback in this test.
      Object.defineProperty(req.socket, "remoteAddress", {
        value: "172.31.0.9",
        configurable: true,
      });
      sync._handle(req, res);
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    const status = await new Promise((resolve, reject) => {
      const req = get({ host: "127.0.0.1", port, path: url }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
    });
    server.close();
    return status;
  };

  test("grants the lock, refuses a second holder, and frees it on release", async () => {
    const sync = new TimeZeroSync(stubApp(), {});
    const lock = "/LanSynchronizationApi/GetLock?NetworkID=";
    assert.equal(await callServed(sync, `${lock}peerA`), 202);
    assert.equal(await callServed(sync, `${lock}peerB`), 409, "peerB is blocked");
    assert.equal(await callServed(sync, `${lock}peerA`), 202, "peerA is idempotent");
    assert.equal(
      await callServed(sync, "/LanSynchronizationApi/ReleaseLock?NetworkID=peerA"),
      200,
    );
    assert.equal(await callServed(sync, `${lock}peerB`), 202, "freed for peerB");
  });
});

describe("remote anchor apply (higher-tick-wins)", () => {
  const remoteBody = (tick, values = "NULL,10,0,0") =>
    JSON.stringify({ ChangeTick: tick, Values: values });

  test("applies a push with a newer tick and adopts it", () => {
    let applied = "none";
    const sync = new TimeZeroSync(stubApp(), {
      onRemoteAnchor: (a) => {
        applied = a ? "set" : "raised";
      },
    });
    sync.anchorTick = 5;
    sync._applyRemote(remoteBody(10));
    assert.equal(applied, "raised");
    assert.equal(sync.anchorTick, 10); // adopted the peer's tick
  });

  test("ignores a stale push (tick <= ours) and keeps our state", () => {
    let called = false;
    const sync = new TimeZeroSync(stubApp(), {
      onRemoteAnchor: () => {
        called = true;
      },
    });
    sync.anchorTick = 20;
    sync._applyRemote(remoteBody(20)); // equal — stale
    sync._applyRemote(remoteBody(3)); // older — stale
    assert.equal(called, false);
    assert.equal(sync.anchorTick, 20);
  });

  test("passes a decoded circle through to onRemoteAnchor", () => {
    let anchor = null;
    const sync = new TimeZeroSync(stubApp(), {
      onRemoteAnchor: (a) => {
        anchor = a;
      },
    });
    sync.anchorTick = 1;
    sync._applyRemote(remoteBody(2, "X'0400000000000000000000C350',10,0,0"));
    assert.ok(anchor);
    assert.equal(anchor.radius, 500); // 0xC350 = 50000 cm
  });

  test("a malformed body is swallowed, not thrown", () => {
    const sync = new TimeZeroSync(stubApp(), {});
    assert.doesNotThrow(() => sync._applyRemote("{not json"));
  });
});
