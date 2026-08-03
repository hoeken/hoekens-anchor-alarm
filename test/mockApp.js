import fs from "fs";
import os from "os";
import path from "path";

// Every temp dir handed out by getDataDirPath(), so none survive the run.
// Tests that want the dir gone mid-run still call cleanupDataDir(); this is
// the backstop for the ones that don't (and on some platforms os.tmpdir() is
// a RAM-backed tmpfs, so leaked dirs cost memory until reboot).
const tempDataDirs = new Set();
let exitHookInstalled = false;

function removeTempDataDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  tempDataDirs.delete(dir);
}

// A fake SignalK `app` for driving the plugin in tests. Every method the
// plugin touches is a recorder; assertions read back from `calls` and the
// delta helpers. getSelfPath reads a settable map so tests can stage a GPS
// fix, engine state, etc.
export function createMockApp(overrides = {}) {
  // Lazily-created per-app temp data dir, mirroring app.getDataDirPath() in the
  // real server. Only tests that touch it (e.g. the icon routes) pay for it;
  // whatever isn't cleaned up explicitly is swept on process exit.
  let dataDir = null;
  const getDataDirPath = () => {
    if (!dataDir) {
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-plugin-"));
      tempDataDirs.add(dataDir);
      if (!exitHookInstalled) {
        exitHookInstalled = true;
        // exit handlers must be synchronous; rmSync is.
        process.on("exit", () => {
          for (const dir of [...tempDataDirs])
            removeTempDataDir(dir);
        });
      }
    }
    return dataDir;
  };
  const calls = {
    status: [],
    pluginError: [],
    providerError: [],
    debug: [],
    errors: [],
    handleMessage: [],
    savePluginOptions: [],
    actionHandlers: [],
    subscriptions: [],
  };
  const selfPaths = new Map();

  const app = {
    setPluginStatus: (s) => calls.status.push(s),
    setPluginError: (s) => calls.pluginError.push(s),
    setProviderError: (e) => calls.providerError.push(e),
    debug: (...a) => calls.debug.push(a),
    error: (...a) => calls.errors.push(a),
    handleMessage: (id, msg) => calls.handleMessage.push({ id, msg }),
    savePluginOptions: (config, cb) => {
      calls.savePluginOptions.push(config);
      if (typeof cb === "function")
        cb(null);
    },
    getSelfPath: (path) => selfPaths.get(path),
    subscriptionmanager: {
      subscribe: (sub, onStop, onError, onDelta) =>
        calls.subscriptions.push({ sub, onStop, onError, onDelta }),
    },
    registerActionHandler: (context, path, handler) =>
      calls.actionHandlers.push({ context, path, handler }),
    getDataDirPath,
    ...overrides,
  };

  const allUpdates = () =>
    calls.handleMessage.flatMap(({ msg }) => msg.updates || []);
  const deltas = () => allUpdates().flatMap((u) => u.values || []);
  const metas = () => allUpdates().flatMap((u) => u.meta || []);

  return {
    app,
    calls,
    setSelfPath: (path, value) => selfPaths.set(path, value),
    deltas,
    metas,
    // Most recent value emitted for a path, or undefined if never emitted.
    lastDelta: (path) => {
      const matching = deltas().filter((d) => d.path === path);
      return matching.length ? matching[matching.length - 1].value : undefined;
    },
    hasDelta: (path) => deltas().some((d) => d.path === path),
    lastStatus: () => calls.status[calls.status.length - 1],
    // Path of the temp data dir (creating it if needed), and a cleanup for it.
    dataDir: getDataDirPath,
    cleanupDataDir: () => {
      if (dataDir)
        removeTempDataDir(dataDir);
      dataDir = null;
    },
    // Forget everything recorded so far — handy between phases of one test.
    reset: () => {
      for (const key of Object.keys(calls))
        calls[key].length = 0;
    },
  };
}
