// Per-identity storage for the web UI's display preferences (the
// /ui-config API). Each identity gets its own sparse JSON file under
// <dataDir>/ui-config/ holding only the keys that identity explicitly saved;
// reads resolve bottom-up through three layers:
//
//   defaultUiConfig()            — schema defaults (ui-config schema fragment)
//   boat-defaults.json           — UI keys lifted out of the plugin config by
//                                  the one-shot migration below, so preferences
//                                  from pre-2.11 installs survive as the
//                                  boat-wide baseline
//   <identity file>              — that user's/device's own saved keys
//
// Identity comes from SignalK's security layer, which resolves the request's
// token to a principal before plugin routes run: `skPrincipal.identifier` is
// the username for user logins and the clientId for device access tokens
// (MFDs etc.) — both stable across token rotation, so preferences follow the
// user through logins and a device through token renewals. Anonymous requests
// (security disabled, or the shared 'AUTO' readonly principal) share one
// anonymous bucket; SignalK blocks writes for readonly sessions, so only a
// security-disabled server ever saves to it — matching the old
// everyone-shares-one-config behavior.

import fs from "fs";
import path from "path";
import { UI_CONFIG_KEYS, defaultUiConfig, pickUiConfig } from "./schema.js";

const STORE_VERSION = 1;
const BOAT_DEFAULTS_FILE = "boat-defaults.json";
const ANONYMOUS_FILE = "anonymous.json";

export class UiConfigStore {
  constructor(app) {
    this.app = app;
  }

  dirPath() {
    return path.join(this.app.getDataDirPath(), "ui-config");
  }

  // The stable storage identity for a request, or null for the anonymous
  // bucket. 'AUTO' is the single identifier tokensecurity assigns every
  // anonymous readonly session, so it maps to the anonymous bucket too.
  identityFor(req) {
    const id = req?.skPrincipal?.identifier;
    return !id || id === "AUTO" ? null : String(id);
  }

  // Identity files are prefixed so an identity literally named "anonymous" or
  // "boat-defaults" can't collide with the reserved files; encodeURIComponent
  // keeps arbitrary usernames filesystem-safe (no path separators).
  fileFor(identity) {
    return identity === null
      ? ANONYMOUS_FILE
      : `identity-${encodeURIComponent(identity)}.json`;
  }

  // Sparse saved config from one store file, tolerating a missing or corrupt
  // file (fresh identity, torn write) as "nothing saved". Foreign keys are
  // dropped on read so a stale file can't smuggle values past the whitelist.
  readFile(file) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(this.dirPath(), file), "utf8"),
      );
      return pickUiConfig(parsed?.config);
    } catch {
      return {};
    }
  }

  // Atomic write (tmp + rename) so a crash mid-write can't tear the file —
  // same pattern as SessionLog. Errors propagate: a failed preference save
  // should surface to the caller, not vanish.
  writeFile(file, config) {
    fs.mkdirSync(this.dirPath(), { recursive: true });
    const target = path.join(this.dirPath(), file);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ version: STORE_VERSION, config }, null, 2),
    );
    fs.renameSync(tmp, target);
  }

  // The full effective config for an identity: defaults, overlaid with the
  // boat-wide baseline, overlaid with the identity's own saved keys.
  resolve(identity) {
    return {
      ...defaultUiConfig(),
      ...this.readFile(BOAT_DEFAULTS_FILE),
      ...this.readFile(this.fileFor(identity)),
    };
  }

  // Merge already-validated updates into the identity's sparse file. Partial
  // by design (matches the POST semantics): keys the identity never saved
  // keep resolving through the lower layers.
  save(identity, updates) {
    const file = this.fileFor(identity);
    this.writeFile(file, { ...this.readFile(file), ...updates });
  }

  // One-shot upgrade for pre-2.11 installs, where UI preferences lived in the
  // plugin config: lift them into boat-defaults.json (unless an earlier run
  // already wrote it) and strip them from the config so they can't linger
  // invisibly now that they're out of the plugin schema. Returns true when
  // the config was mutated so the caller can persist it. Idempotent — once
  // stripped, there's nothing left to migrate.
  migrateFromPluginConfig(config = {}) {
    const legacy = pickUiConfig(config);
    if (Object.keys(legacy).length === 0)
      return false;

    if (!fs.existsSync(path.join(this.dirPath(), BOAT_DEFAULTS_FILE)))
      this.writeFile(BOAT_DEFAULTS_FILE, legacy);

    for (const key of UI_CONFIG_KEYS)
      delete config[key];
    return true;
  }
}
