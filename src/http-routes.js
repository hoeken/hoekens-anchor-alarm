/*
 * Copyright 2016 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { AnchorError, ValidationError } from "./errors.js";
import { coerceUiConfig } from "./schema.js";

const require = createRequire(import.meta.url);
const openapi = require("./openApi.json");
const packageJson = require("../package.json");

// Custom own-boat icon upload (see /icon routes below). The image is stored in
// the plugin data dir as a single `boat-icon.<ext>` file; the extension is
// derived from the bytes, never from the client's Content-Type claim.
const MAX_ICON_BYTES = 500 * 1024;
const ICON_BASENAME = "boat-icon";

// Recognized image types keyed by the extension we store under. `test(buf)`
// sniffs the leading bytes so a spoofed Content-Type can't smuggle a
// non-image through. Order doesn't matter — the first matching test wins.
const ICON_TYPES = [
  {
    ext: "png",
    mime: "image/png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    // GIF87a / GIF89a
    ext: "gif",
    mime: "image/gif",
    test: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
  {
    // RIFF....WEBP
    ext: "webp",
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

// Identify the image type from its magic bytes, or null if unrecognized.
function sniffIconType(buf) {
  return ICON_TYPES.find((t) => t.test(buf)) || null;
}

// Absolute path of the stored icon (whatever its extension), or null when none
// exists. Tolerates a missing/unreadable data dir by returning null so callers
// treat it as "no custom icon".
function iconPath(app) {
  try {
    const dir = app.getDataDirPath();
    const match = fs
      .readdirSync(dir)
      .find((f) => f.startsWith(`${ICON_BASENAME}.`));
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

// Remove any stored icon file(s). Idempotent — silently does nothing when none.
function removeIcon(app) {
  const existing = iconPath(app);
  if (existing)
    fs.rmSync(existing, { force: true });
}

// Read the raw request body into a Buffer, stopping buffering once the byte cap
// is exceeded so an oversized upload can't be held in memory in full. Resolves
// with the bytes, or rejects with an { tooLarge: true } marker when over the
// cap. Tests pass a pre-buffered Buffer as req.body, which we honor directly.
function readBodyBytes(req, limit) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.length > limit
      ? Promise.reject({ tooLarge: true })
      : Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let chunks = [];
    let total = 0;
    let over = false;
    req.on("data", (chunk) => {
      // Once over the cap, drop what we've buffered and discard the rest, but
      // keep draining the request instead of destroying it: tearing down the
      // socket mid-upload makes the browser's fetch reject with a generic
      // "Failed to fetch" rather than receiving our 413 "image too large" body.
      if (over)
        return;
      total += chunk.length;
      if (total > limit) {
        over = true;
        chunks = null;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      over ? reject({ tooLarge: true }) : resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function register(app, plugin, router) {
  plugin.getOpenApi = () => openapi;

  function fail(res, err) {
    if (err instanceof AnchorError) {
      app.debug(err.message);
      res.status(403).json({
        statusCode: 403,
        state: "FAILED",
        message: err.message,
      });
    } else {
      app.error(err);
      res.status(500).json({
        statusCode: 500,
        state: "FAILED",
        message: err.message || "internal error",
      });
    }
  }

  router.post("/dropAnchor", (req, res) => {
    try {
      plugin.dropAnchor({
        position: req.body.position,
        zone: req.body.zone,
      });
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/setZone", (req, res) => {
    try {
      plugin.setZone(req.body.zone);
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/raiseAnchor", (req, res) => {
    try {
      plugin.raiseAnchor();
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });

  // Anchoring session metadata (drop/raise timestamps, anchor position,
  // zone), newest first. The open session — anchor still down — has no
  // raisedAt. Tracks are not served here: the UI reconstructs them from the
  // server's History API using each session's time window.
  router.get("/sessions", (req, res) => {
    res.json({ sessions: plugin.sessionLog.all() });
  });

  router.delete("/sessions/:id", (req, res) => {
    if (plugin.sessionLog.remove(req.params.id)) {
      res.json({ statusCode: 200, state: "COMPLETED" });
    } else {
      res.status(404).json({
        statusCode: 404,
        state: "FAILED",
        message: "no such session",
      });
    }
  });

  router.get("/ui-config", (req, res) => {
    // The preference set is resolved per identity (username / device
    // clientId / anonymous — see UiConfigStore). The rest are read-only
    // ride-alongs, not stored preference keys; coerceUiConfig ignores unknown
    // keys, so a client echoing them back on POST is harmless.
    // - glitchFilterSpeed is boat-level plugin config (it drives the server's
    //   own-position filter) but the UI still reads it to filter glitches out
    //   of displayed fleet tracks.
    // - selfId (e.g. "urn:mrn:imo:mmsi:123456789") lets the UI pick its own
    //   entry out of the bulk /vessels payload instead of fetching the
    //   (potentially large) /vessels/self tree separately.
    // - version saves a /plugins/<id> round trip for the settings footer.
    const store = plugin.uiConfigStore;
    res.json({
      ...store.resolve(store.identityFor(req)),
      glitchFilterSpeed: plugin.configuration?.glitchFilterSpeed ?? 0,
      hasCustomIcon: iconPath(app) !== null,
      selfId: app.selfId,
      version: packageJson.version,
    });
  });

  // ============================================================
  // CUSTOM OWN-BOAT ICON  (GET public; PUT/DELETE are writes and rely on
  // SignalK gating write methods on plugin routes — same assumption as the
  // POST /ui-config route above.)
  // ============================================================

  router.get("/icon", (req, res) => {
    try {
      const file = iconPath(app);
      if (!file) {
        res.status(404).json({
          statusCode: 404,
          state: "FAILED",
          message: "no custom boat icon set",
        });
        return;
      }
      const type = ICON_TYPES.find((t) => t.ext === path.extname(file).slice(1));
      res.set("Content-Type", type ? type.mime : "application/octet-stream");
      // The file is overwritten in place on re-upload, so keep it revalidatable
      // rather than long-cached; the UI also cache-busts with a ?v= param.
      res.set("Cache-Control", "no-cache");
      res.send(fs.readFileSync(file));
    } catch (err) {
      fail(res, err);
    }
  });

  router.put("/icon", (req, res) => {
    readBodyBytes(req, MAX_ICON_BYTES)
      .then((buf) => {
        if (!buf || buf.length === 0) {
          res.status(400).json({
            statusCode: 400,
            state: "FAILED",
            message: "empty upload",
          });
          return;
        }

        const type = sniffIconType(buf);
        if (!type) {
          res.status(415).json({
            statusCode: 415,
            state: "FAILED",
            message: "unsupported image type — use jpg, png, gif, or webp",
          });
          return;
        }

        // Replace any prior icon (which may have a different extension) so only
        // one boat-icon.* ever exists.
        removeIcon(app);
        const dir = app.getDataDirPath();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${ICON_BASENAME}.${type.ext}`), buf);
        res.json({ statusCode: 200, state: "COMPLETED" });
      })
      .catch((err) => {
        if (err && err.tooLarge) {
          res.status(413).json({
            statusCode: 413,
            state: "FAILED",
            message: `image too large — max ${MAX_ICON_BYTES / 1024} KB`,
          });
          return;
        }
        fail(res, err);
      });
  });

  router.delete("/icon", (req, res) => {
    try {
      removeIcon(app);
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });

  // Persist UI-editable settings for the requesting identity. Only
  // whitelisted keys are accepted; each is coerced/validated against the UI
  // preference schema and merged into that identity's store file. SignalK
  // gates POSTs to plugin routes behind authentication, so reaching here
  // implies the caller is logged in (or security is disabled entirely, in
  // which case everyone shares the anonymous bucket).
  router.post("/ui-config", (req, res) => {
    try {
      const updates = coerceUiConfig(req.body || {});

      const store = plugin.uiConfigStore;
      store.save(store.identityFor(req), updates);

      res.json({ statusCode: 200, state: "COMPLETED", config: updates });
    } catch (err) {
      fail(res, err);
    }
  });

  // Persist one chart overlay's show/hide choice for the requesting identity
  // (the chart checkboxes in the map's layer control — see the `charts`
  // ui-config key; a chart with no entry defaults to enabled). A dedicated
  // route rather than a POST /ui-config body because the charts map is keyed
  // by dynamic chart identifiers: the client would have to echo the whole
  // map back (racing other tabs), while here it names just the one chart it
  // toggled. Auth-gated by SignalK like every other plugin-route write.
  router.post("/ui-config/charts", (req, res) => {
    try {
      const { identifier, enabled } = req.body || {};
      if (typeof identifier !== "string" || identifier.length === 0)
        throw new ValidationError("identifier must be a non-empty string");
      if (typeof enabled !== "boolean")
        throw new ValidationError("enabled must be a boolean");

      const store = plugin.uiConfigStore;
      store.saveChartEnabled(store.identityFor(req), identifier, enabled);

      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });
}
