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
    assert.equal(f[8], "1"); // CanSync
    assert.equal(f[13], "7"); // anchorWatchTick
    assert.equal(f[14], "99"); // visibleHosts (master election)
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

  test("parses a real MASTERCABIN beacon", () => {
    const raw =
      "TZ Sync 1.0;MASTERCABIN;TZ Professional;;;;MASTERCABIN/d5ff170c;34944412;1;1;31859;1;0;158;1601;0;22347062";
    const peer = parseBeacon(raw, "172.31.3.54");
    assert.equal(peer.name, "MASTERCABIN");
    assert.equal(peer.deviceType, "TZ Professional");
    assert.equal(peer.canSync, true);
    assert.equal(peer.anchorWatchTick, 158);
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
