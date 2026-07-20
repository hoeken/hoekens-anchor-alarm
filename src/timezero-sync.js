import dgram from "dgram";
import http from "http";
import os from "os";

// TimeZero LAN anchor-watch synchronisation.
//
// TimeZero (TZ Professional / TZ iBoat) synchronises anchor watch state between
// instances on the local network. The mechanism is undocumented but was
// reverse-engineered and validated against live TZ hardware; this module speaks
// it so a Signal K anchor drop/raise/reshape appears on TZ, and a TZ anchor
// change flows back into Signal K.
//
// Two layers:
//  1. Discovery — every second, each peer UDP-broadcasts a plaintext beacon on
//     DISCOVERY_PORT (33000) advertising its name, capabilities, and a set of
//     monotonic "tick" counters, one of which is the AnchorWatch tick.
//  2. Sync — a plain HTTP server on COMMAND_PORT (32000) exposes
//     /LanSynchronizationApi/AnchorWatch. A peer GETs it to pull the current
//     anchor, or POSTs to push a newer one (higher ChangeTick wins). The anchor
//     body is JSON {ChangeTick, Values}; Values is a CSV of the underlying DB
//     row, with the circle geometry as a 13-byte hex blob.
//
// TZ grants account-free LAN sync only to peers whose IP is in 172.31.x.x (the
// Furuno NavNet subnet); off that subnet it requires a shared My TIMEZERO
// account, which we can't provide. So sync only functions when Signal K is
// reachable on a 172.31.x.x address.
//
// Every network operation is a no-throw: anchor alarm operation is safety
// critical and must never be blocked or crashed by a sync failure. Errors are
// reported through app.error/app.debug and the operation becomes a no-op.

const DISCOVERY_PORT = 33000;
const COMMAND_PORT = 32000;
const BEACON_INTERVAL_MS = 1000;
// How long a peer may hold the sync lock before we treat it as abandoned.
const LOCK_TIMEOUT_MS = 30000;
const PROTOCOL = "TZ Sync 1.0";
const DEVICE_TYPE = "TZ iBoat"; // a legitimate sync-peer device type

// Spherical Mercator (EPSG:3857) earth radius. TZ stores anchor geometry as
// projected metres; confirmed against live TZ hardware.
const MERCATOR_R = 6378137.0;

// TZ / MaxSea timestamps are seconds since 1990-01-01 UTC, not the Unix epoch.
const TZ_EPOCH_OFFSET = 631152000;

// ---- pure geometry / blob codec (unit-testable, no I/O) --------------------

// WGS84 lat/lon -> spherical Mercator metres. Latitude is clamped to the
// projection's valid band so a bad fix can't produce Infinity.
export function toMercator(latitude, longitude) {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  return {
    x: MERCATOR_R * (longitude * Math.PI) / 180,
    y: MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2)),
  };
}

// Spherical Mercator metres -> WGS84 lat/lon.
export function fromMercator(x, y) {
  return {
    longitude: (x / MERCATOR_R) * 180 / Math.PI,
    latitude:
      (2 * Math.atan(Math.exp(y / MERCATOR_R)) - Math.PI / 2) * 180 / Math.PI,
  };
}

// Encode an anchor circle (centre + radius in metres) as TZ's 13-byte geometry
// blob: type byte 0x04, then X, Y, radius as big-endian int32 in centimetres.
export function encodeGeometry(position, radiusMeters) {
  const { x, y } = toMercator(position.latitude, position.longitude);
  const buf = Buffer.alloc(13);
  buf.writeUInt8(0x04, 0);
  buf.writeInt32BE(Math.round(x * 100), 1);
  buf.writeInt32BE(Math.round(y * 100), 5);
  buf.writeInt32BE(Math.round(radiusMeters * 100), 9);
  return buf;
}

// Decode a 13-byte geometry blob back to {position, radius}. Returns null for a
// null/short/wrong-type blob (e.g. a raised anchor, whose geometry is NULL).
export function decodeGeometry(buf) {
  if (!buf || buf.length < 13 || buf.readUInt8(0) !== 0x04)
    return null;
  const x = buf.readInt32BE(1) / 100;
  const y = buf.readInt32BE(5) / 100;
  const radius = buf.readInt32BE(9) / 100;
  return { position: fromMercator(x, y), radius };
}

// Build the AnchorWatch "Values" CSV: Geometry, WarningDelay, LastModificationDate,
// ActivationDate — geometry as a SQLite hex blob literal, timestamps in TZ epoch.
// A null anchor (raised) serialises with Geometry = NULL.
export function buildValues(anchor, nowUnixSeconds) {
  const tz = Math.round(nowUnixSeconds) - TZ_EPOCH_OFFSET;
  const warnDelay = anchor?.warningDelay ?? 10;
  if (!anchor || anchor.position == null || anchor.radius == null)
    return `NULL,${warnDelay},${tz},${tz}`;
  const hex = encodeGeometry(anchor.position, anchor.radius)
    .toString("hex")
    .toUpperCase();
  return `X'${hex}',${warnDelay},${tz},${anchor.activationTz ?? tz}`;
}

// Parse an AnchorWatch "Values" CSV back to {position, radius} or null (raised).
// Only the geometry field is interpreted; the rest is metadata we don't need.
export function parseValues(values) {
  if (typeof values !== "string")
    return null;
  const geom = values.split(",")[0];
  if (!geom || geom === "NULL")
    return null;
  const m = /^X'([0-9A-Fa-f]+)'$/.exec(geom);
  if (!m)
    return null;
  try {
    return decodeGeometry(Buffer.from(m[1], "hex"));
  } catch {
    return null;
  }
}

// Beacon field layout, taken from live TimeZero beacons (semicolon-separated).
// A signed-in TZ Professional looks like:
//   TZ Sync 1.0;TZPRO-NAVPC;TZ Professional;;<userId>;Cloud;TZPRO-NAVPC/<uuid>;35847804;4;1;205253;95;1007586792;22;3151;0;270720187
//    [0]protocol [1]name [2]deviceType [3]layersToken [4]userId [5]"Cloud" when
//    cloud-connected [6]name/uuid [7]uniqueId [8]visibleHosts [9]canCloudSync
//    [10]currentTick [11]activeRouteTick [12]largeDataHash [13]schemaVersion
//    [14]anchorWatchTick [15]reserved [16]hash
//
// [14] is the anchor tick: it tracks the ChangeTick returned by
// /LanSynchronizationApi/AnchorWatch and increments on every anchor edit, while
// [13] stays put (it's the schema version — 22 on TZ, and the same across
// unrelated peers). [11] likewise matches the ActiveRoute CurrentTick.
const F_VISIBLE_HOSTS = 8;
const F_ANCHOR_TICK = 14;

export function buildBeacon(state) {
  return [
    PROTOCOL,
    state.hostName,
    DEVICE_TYPE,
    "", // [3] layers token
    // [4] My TIMEZERO user id. TimeZero grants sync to a peer advertising the
    // same non-empty user id (plain string equality), which is what makes sync
    // work off the NavNet subnet. Empty falls back to the NavNet-only path.
    state.userId || "",
    "", // [5] "Cloud" when cloud-connected; we never are
    `${state.hostName}/${state.uuid}`,
    "10000000", // [7] uniqueId
    // [8] visibleHosts — how many peers we can see. TimeZero elects the host
    // with the highest count as master, so advertise a high number to be
    // chosen and have our anchor pulled.
    String(state.visibleHosts ?? 1),
    "0", // [9] CanCloudSync
    String(state.currentTick ?? 1), // [10]
    "1", // [11] activeRouteTick
    "0", // [12] largeDataHash
    "22", // [13] schemaVersion — TimeZero broadcasts 22
    String(state.anchorWatchTick ?? 0), // [14]
    "0", // [15]
    "0", // [16] hash
  ].join(";");
}

// Parse a received beacon into a peer record, or null if it isn't a TZ beacon.
export function parseBeacon(str, address) {
  if (typeof str !== "string" || !str.startsWith(PROTOCOL.split(" ")[0]))
    return null;
  const f = str.split(";");
  if (f.length <= F_ANCHOR_TICK)
    return null;
  return {
    address,
    name: f[1],
    deviceType: f[2],
    userId: f[4] || "",
    uuid: f[6],
    // TimeZero broadcasts a host count here rather than a flag, so treat any
    // positive value as "can sync".
    canSync: (parseInt(f[F_VISIBLE_HOSTS], 10) || 0) > 0,
    visibleHosts: parseInt(f[F_VISIBLE_HOSTS], 10) || 0,
    anchorWatchTick: parseInt(f[F_ANCHOR_TICK], 10) || 0,
  };
}

// A stable-ish UUID without external deps. crypto.randomUUID would be ideal but
// keeps this module dependency-light and testable; a v4-shaped string suffices
// since TZ only uses it as an opaque host identifier.
function makeUuid() {
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${h()}-${h()}${h()}${h()}`;
}

// ---- the live sync engine (no-throw network I/O) ---------------------------

export class TimeZeroSync {
  constructor(app, options = {}) {
    this.app = app;
    this.hostName = options.hostName || "SignalK";
    // My TIMEZERO user id, advertised in the beacon. When set (and matching the
    // TimeZero instances'), TimeZero syncs with us on any network; when empty,
    // sync is limited to the NavNet subnet. See onNavNet/canReachPeers.
    this.userId = (options.userId || "").trim();
    this.uuid = makeUuid();
    this.socket = null;
    this.server = null;
    this.beaconTimer = null;
    // Monotonic tick; bumped every time our anchor changes so TZ sees us as
    // newer and pulls. Persisted lifetime isn't needed — TZ compares relative
    // to what it last saw, and a restart re-advertising a low tick just means
    // TZ won't pull a stale copy from us, which is correct.
    this.anchorTick = 1;
    // Provider for the current anchor: () => {position:{latitude,longitude},
    // radius} | null. Set by the plugin so a TZ GET reflects live SK state.
    this.anchorProvider = options.anchorProvider || (() => null);
    // Called when a TZ peer pushes an anchor to us: (anchor|null) => void.
    // anchor is {position, radius} to set, or null to raise.
    this.onRemoteAnchor = options.onRemoteAnchor || (() => {});
    // Peers discovered via the beacon, keyed by source IP, used to decide who
    // may talk to the sync endpoint when authorising by user id.
    this.peers = new Map();
    // Guards against overlapping pulls; see _pullFrom.
    this.pulling = false;
    // NetworkID of the peer currently holding our sync lock, and when it was
    // taken. A peer that dies mid-sync never sends ReleaseLock, so the lock
    // expires rather than blocking every other peer until a plugin restart.
    this.lockHolder = null;
    this.lockTakenAt = 0;
    this.started = false;
  }

  // A held lock older than LOCK_TIMEOUT_MS is treated as abandoned. Peers hold
  // it only for the few requests of one sync round, so this is generous.
  _lockExpired() {
    return Date.now() - this.lockTakenAt > LOCK_TIMEOUT_MS;
  }

  // Whether an address may use the sync endpoint.
  //
  // NavNet peers are always allowed: that is the subnet TimeZero itself trusts
  // for account-free sync, and it's a dedicated instrument network.
  //
  // Off NavNet, an address is allowed only once we've seen it broadcast a
  // beacon carrying our configured user id. That keeps the safety-critical
  // endpoint closed to arbitrary LAN hosts — matching TimeZero's own rule,
  // which pairs peers on user id rather than opening up to the whole network.
  isTrustedPeer(address) {
    if (!address)
      return false;
    if (address.startsWith("172.31."))
      return true;
    if (!this.userId)
      return false;
    return this.peers.get(address)?.userId === this.userId;
  }

  // True only when Signal K has a 172.31.x.x address — TZ's account-free LAN
  // sync is restricted to that (NavNet) subnet.
  onNavNet() {
    try {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list) {
          if (ni.family === "IPv4" && ni.address.startsWith("172.31."))
            return true;
        }
      }
    } catch {
      // ignore — treated as not on NavNet
    }
    return false;
  }

  start() {
    if (this.started)
      return;
    this.started = true;
    this._startServer();
    this._startDiscovery();
    this.app.debug(`TimeZero sync started as "${this.hostName}" (${this.uuid})`);
  }

  stop() {
    this.started = false;
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
    this.socket = null;
    try {
      this.server?.close();
    } catch {
      /* already closed */
    }
    this.server = null;
  }

  // Bump our advertised anchor tick so the next beacon tells peers we changed.
  //
  // The tick is account-wide in TimeZero and already in the thousands, so it
  // isn't enough to increment our own counter: after a plugin restart we would
  // start again from 1 and every local anchor change would look older than
  // TimeZero's current state, so no peer would ever pull it. Step past the
  // highest tick any peer has advertised instead, which keeps a local change
  // strictly newer than everything we've seen.
  notifyAnchorChanged() {
    this.anchorTick = Math.max(this.anchorTick, this._highestPeerTick()) + 1;
  }

  // The highest anchor tick advertised by any peer we've heard from.
  _highestPeerTick() {
    let highest = 0;
    for (const peer of this.peers.values()) {
      if (peer.anchorWatchTick > highest)
        highest = peer.anchorWatchTick;
    }
    return highest;
  }

  _currentSerialized() {
    const anchor = (() => {
      try {
        return this.anchorProvider();
      } catch {
        return null;
      }
    })();
    return {
      ChangeTick: this.anchorTick,
      Values: buildValues(anchor, Date.now() / 1000),
    };
  }

  _startServer() {
    const server = http.createServer((req, res) => this._handle(req, res));
    server.on("error", (err) => {
      this.app.error(`TimeZero sync HTTP server error: ${err.message}`);
    });
    server.listen(COMMAND_PORT, "0.0.0.0", () => {
      this.app.debug(`TimeZero sync serving on :${COMMAND_PORT}`);
    });
    this.server = server;
  }

  // Handle one sync request. Split out from _startServer so the endpoint's
  // behaviour can be exercised directly in tests.
  _handle(req, res) {
    try {
      // The endpoint is unauthenticated plaintext HTTP (the protocol offers
      // no auth) and the anchor watch is safety-critical — a GET discloses
      // the boat's position and a POST can move or raise the anchor — so
      // every request is checked against the peers we trust.
      const remote = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
      if (!this.isTrustedPeer(remote)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const path = (req.url || "").split("?")[0].replace(/\/+$/, "");

      // Advisory sync lock, as TimeZero peers use between themselves: 202
      // when granted, 409 while someone else holds it. Re-requesting your own
      // lock is idempotent so a peer that missed our reply can retry.
      if (path.endsWith("/LanSynchronizationApi/GetLock")) {
        const who = new URL(req.url, "http://x").searchParams.get("NetworkID");
        if (this.lockHolder && this.lockHolder !== who && !this._lockExpired()) {
          res.writeHead(409);
        } else {
          this.lockHolder = who;
          this.lockTakenAt = Date.now();
          res.writeHead(202);
        }
        res.end();
        return;
      }
      if (path.endsWith("/LanSynchronizationApi/ReleaseLock")) {
        const who = new URL(req.url, "http://x").searchParams.get("NetworkID");
        if (this.lockHolder === who)
          this.lockHolder = null;
        res.writeHead(200);
        res.end();
        return;
      }

      const isAnchor = path.endsWith("/LanSynchronizationApi/AnchorWatch");
      if (isAnchor && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this._currentSerialized()));
        return;
      }
      if (isAnchor && req.method === "POST") {
        let body = "";
        req.on("data", (c) => {
          body += c;
          if (body.length > 1e6)
            req.destroy(); // guard against a runaway upload
        });
        req.on("end", () => {
          this._applyRemote(body);
          res.writeHead(201);
          res.end();
        });
        return;
      }
      // Answer 200 to TZ's reachability probe (bare GET /) and everything
      // else so it treats us as a live peer.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    } catch (err) {
      this.app.error(`TimeZero sync request error: ${err.message}`);
      try {
        res.writeHead(500);
        res.end();
      } catch {
        /* response already gone */
      }
    }
  }

  // Fetch a peer's anchor after its beacon advertised a newer tick, following
  // the same sequence TimeZero peers use between themselves: take the sync
  // lock, GET the anchor, release the lock. The lock is advisory — TimeZero
  // answers 202 when granted and 409 while another peer holds it — so a
  // refusal just means "try again on the next beacon" rather than an error.
  async _pullFrom(peer, previousTick) {
    if (this.pulling)
      return; // one pull at a time; the next beacon retries
    this.pulling = true;
    const networkId = `${this.hostName}/${this.uuid}`;
    try {
      const lock = await this._get(
        peer.address,
        `/LanSynchronizationApi/GetLock?NetworkID=${encodeURIComponent(networkId)}`,
      );
      if (lock.status !== 202) {
        this.app.debug(
          `TimeZero sync lock busy on ${peer.name} (${lock.status}); retrying next beacon`,
        );
        return;
      }
      try {
        const res = await this._get(
          peer.address,
          "/LanSynchronizationApi/AnchorWatch",
        );
        if (res.status === 200) {
          this.app.debug(
            `TimeZero sync pulled anchor from ${peer.name} (tick ${previousTick ?? "?"} -> ${peer.anchorWatchTick})`,
          );
          this._applyRemote(res.body);
        }
      } finally {
        await this._get(
          peer.address,
          `/LanSynchronizationApi/ReleaseLock?NetworkID=${encodeURIComponent(networkId)}`,
        ).catch(() => {});
      }
    } catch (err) {
      this.app.debug(`TimeZero sync pull from ${peer.name} failed: ${err.message}`);
    } finally {
      this.pulling = false;
    }
  }

  // Minimal HTTP GET. TimeZero responds with chunked encoding, so this must
  // speak HTTP/1.1 (Node's http client does).
  _get(address, path) {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { host: address, port: COMMAND_PORT, path, timeout: 5000 },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
    });
  }

  _applyRemote(body) {
    try {
      const dto = JSON.parse(body);
      // Higher ChangeTick wins: ignore a stale/replayed push so a delayed peer
      // can't clobber a newer local anchor. Adopt the peer's tick when we take
      // its value, so our next beacon advertises the state we now hold.
      if (typeof dto.ChangeTick === "number" && dto.ChangeTick <= this.anchorTick) {
        this.app.debug(`TimeZero sync ignoring stale push tick=${dto.ChangeTick}`);
        return;
      }
      const anchor = parseValues(dto.Values);
      this.app.debug(
        `TimeZero sync received anchor tick=${dto.ChangeTick} ${anchor ? "set" : "raised"}`,
      );
      if (typeof dto.ChangeTick === "number")
        this.anchorTick = dto.ChangeTick;
      this.onRemoteAnchor(anchor);
    } catch (err) {
      this.app.error(`TimeZero sync bad remote anchor: ${err.message}`);
    }
  }

  _startDiscovery() {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("error", (err) => {
      this.app.error(`TimeZero sync discovery error: ${err.message}`);
    });
    socket.on("message", (msg, rinfo) => {
      try {
        const peer = parseBeacon(msg.toString("utf8"), rinfo.address);
        // Ignore our own beacon echoing back off the broadcast.
        if (!peer || peer.uuid?.endsWith(this.uuid))
          return;
        const known = this.peers.get(rinfo.address);
        this.peers.set(rinfo.address, peer);
        if (!known)
          this.app.debug(
            `TimeZero peer ${peer.name} (${rinfo.address}) ${peer.deviceType}`,
          );
        // A peer advertising a higher anchor tick than ours has an anchor
        // change we haven't seen — go and fetch it.
        if (this.isTrustedPeer(rinfo.address) && peer.anchorWatchTick > this.anchorTick)
          this._pullFrom(peer, known?.anchorWatchTick);
      } catch {
        /* not a beacon we understand */
      }
    });
    socket.bind(DISCOVERY_PORT, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        /* some stacks disallow; beacons just won't send */
      }
      this.app.debug(`TimeZero sync discovery on :${DISCOVERY_PORT}`);
    });
    this.socket = socket;

    this.beaconTimer = setInterval(() => this._sendBeacon(), BEACON_INTERVAL_MS);
    if (this.beaconTimer.unref)
      this.beaconTimer.unref();
  }

  _sendBeacon() {
    if (!this.socket)
      return;
    const beacon = Buffer.from(
      buildBeacon({
        hostName: this.hostName,
        uuid: this.uuid,
        userId: this.userId,
        anchorWatchTick: this.anchorTick,
        currentTick: this.anchorTick,
        // High so we win TZ's master election and it pulls from us.
        visibleHosts: 99,
      }),
      "utf8",
    );
    for (const bc of this._navNetBroadcasts()) {
      this.socket.send(beacon, DISCOVERY_PORT, bc, (err) => {
        if (err)
          this.app.debug(`TimeZero sync beacon send failed (${bc}): ${err.message}`);
      });
    }
  }

  // Where to send the beacon.
  //
  // Without a user id, TimeZero's account-free trust check accepts a peer only
  // if its source IP is in 172.31.x.x, so broadcasting anywhere else would just
  // be discovered-and-rejected — restrict to NavNet.
  //
  // With a user id, TimeZero matches on the id instead of the subnet, so we
  // broadcast on every interface to reach peers on ordinary LANs.
  _navNetBroadcasts() {
    const out = new Set();
    const navNetOnly = !this.userId;
    try {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list) {
          if (ni.family !== "IPv4" || ni.internal)
            continue;
          if (navNetOnly && !ni.address.startsWith("172.31."))
            continue;
          const ip = ni.address.split(".").map(Number);
          const mask = ni.netmask.split(".").map(Number);
          out.add(ip.map((o, i) => (o & mask[i]) | (~mask[i] & 255)).join("."));
        }
      }
    } catch {
      /* no interfaces enumerable */
    }
    return [...out];
  }
}
