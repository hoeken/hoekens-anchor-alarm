// A fake SignalK `app` for driving the plugin in tests. Every method the
// plugin touches is a recorder; assertions read back from `calls` and the
// delta helpers. getSelfPath reads a settable map so tests can stage a GPS
// fix, engine state, etc.
export function createMockApp(overrides = {}) {
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
    // Forget everything recorded so far — handy between phases of one test.
    reset: () => {
      for (const key of Object.keys(calls))
        calls[key].length = 0;
    },
  };
}
