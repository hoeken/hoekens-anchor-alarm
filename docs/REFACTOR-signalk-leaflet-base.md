# Refactor Plan: `signalk-leaflet-base`

Extracting a reusable SignalK + Leaflet plotter base from `hoekens-anchor-alarm`, and standing up `super-simple-plotter` on top of it.

> Status: reference plan. Grounded in the module map of the current repo (branch `master`). This is the design of record for implementation; deviations should update this doc.

---

## 1. Executive summary

The recommended shape is a **single git repo converted to an npm-workspaces monorepo** with three workspaces:

- `packages/base` — a **private, unpublished** ESM library named `signalk-leaflet-base`. It is *not itself a SignalK plugin* (no `signalk-*` keywords, no `signalk{}` block). It owns the generic SignalK/Leaflet plumbing: the frontend `PlotterApp`/`VesselState` base classes, the generic HUD controls (`FleetLayer`, `StatusBar`, `ThemeControl`, `HomeButtonControl`, `ConfigPanel` engine, `Modal`, `WindPanel`, `TidePanel`, `HudPanel` base), the service layer (`SignalKHelper` minus anchor verbs, `SignalKStream`, `DisplayUnit`, `BoatConfig`, `ShipIcons`, `WindBarb`, `ChartLayers`, `SeascapeLoader`, `BrowserSupport`, `StaleReloader`, `GeoMath.calculateBowCoordinates`), the backend harness (`createPlugin`, `SignalKBus`, `Watchdog`, `PluginError`, base `http-routes`, schema machinery + `composeSchema`), `shared/geo.js`, and the shared Vite/ESLint config + test harness (`mockApp`, `helpers`).
- `packages/hoekens-anchor-alarm` — the existing published SignalK package. Keeps its `name`, `signalk{}` metadata, `src/index.cjs` shim, branding, README, screenshots, and *all anchor domain code* (anchor deltas, watch-zones, scopes, `AnchorController`, `AnchorOverlay`, `ScopePanel`, `InfoPanel.setStatus`, `ControlToolbar`, `AnchorState`). Reduced to a thin `AnchorApp extends PlotterApp` + a backend `createPlugin(app, anchorSpec)`.
- `packages/super-simple-plotter` — a new published SignalK package: a near-empty `class Plotter extends PlotterApp {}` + a minimal backend spec (base routes only: `/ui-config` + `/icon`).

Base is consumed by the **frontend** via Vite bundling (base UI is inlined into each app's `public/` at build, exactly like `shared/` is today) and by the **backend** via `bundledDependencies` (base backend source is physically packed into each app's npm tarball, so the SignalK server's `require()` resolves it from `node_modules` with no publish step). A mandatory `npm pack --dry-run` assertion in each app's release workflow verifies `node_modules/signalk-leaflet-base` is present in the tarball; the documented fallback is esbuild-bundling the small backend core.

The extraction is done **in place and bottom-up**: leaf modules first, then HUD/services, then the backend harness, then `AppState`, and the composition root `AnchorAlarm.js` **last** — so the two hard files (`AnchorAlarm.js` 797 LOC, `src/index.js` 614 LOC) are refactored against an already-green base. `hoekens-anchor-alarm` remains shippable at every phase.

Extension is **single inheritance with a small set of named protected hooks** (`createState`, `getDefaultConfig`, `getConfigFields`, `buildControls`, `buildPanels`, `onInitialData`, `getHomeView`/`onHome`, `onUpdate`, `onConfigSaved`) — **not** a registry framework and **not** a bespoke declarative config-field DSL. The editable-shape registry, `AnchorOverlay`, `AnchorController`, `ControlToolbar`, and all concrete zone classes **stay in the anchor app**; only genuinely generic leaf primitives (`ZoneHandle`, `regularPolygonVertices`, `calculateBowCoordinates`) move to base.

> ### Decisions still needed from the maintainer
> These are enumerated with recommended defaults in §10. The load-bearing ones:
> 1. **Keep base unpublished (workspace-internal + `bundledDependencies`)?** — *Recommended: yes.* Zero base-publish/version-lockstep ceremony; revisit only if a third party wants to build on base.
> 2. **Does `super-simple-plotter` ship a backend plugin at all?** — *Recommended: yes, a minimal one* (for `/ui-config` config persistence + custom boat icon). This justifies the backend base extraction. If "no", ~40% of the backend work becomes anchor-only.
> 3. **Accept the classification corrections** (`ControlToolbar` is anchor, not common; only `shared/geo.js` is base — `scopes.js` + `watch-zones/*` are anchor)? — *Recommended: yes.*
> 4. **Inheritance-with-hooks over a registry/composition model?** — *Recommended: yes* (closer to current shape, smaller rewrite, adequate for two apps).
> 5. **Ship no generic shape/overlay system now?** — *Recommended: yes* (YAGNI for a plotter with no on-map editable shapes).

---

## 2. Current architecture

One npm package, one Vite build, one published tarball. Four subsystems:

**Backend plugin (`src/`).** `src/index.cjs` is a 7-line CJS shim that `require("./index.js").default` so signalk-server's `require()`-based loader gets the ESM default export (the plugin factory `function(app)`). `src/index.js` (614 LOC) is the plugin lifecycle + the entire anchor service: it builds the SignalK `plugin` object (`id`/`name`/`description`/`schema`/`start`/`stop`/`registerWithRouter`), wires `SignalKBus` batching over `app.handleMessage`, subscribes to `navigation.position` via `app.subscriptionmanager.subscribe`, runs drag detection (`checkPosition` → `zone.contains`), emits `navigation.anchor.*` deltas and `notifications.navigation.anchor`, and implements the anchor service (`dropAnchor`/`setZone`/`raiseAnchor`/`setRadius`) plus legacy PUT action handlers. Supporting files: `schema.js` (412 LOC — one flat `buildSchema(app)` mixing base + anchor keys, plus the generic coercion/whitelist/defaults engine `coerceToSchema`/`coerceUiConfig`/`pickUiConfig`/`applyDefaults` and anchor-only `migrateConfig`/`readZoneConfig`), `http-routes.js` (305 LOC — anchor control routes + the generic icon subsystem + `/ui-config` + `fail()` error→HTTP mapper), `signalk-bus.js` (clean base), `watchdog.js` (clean base), `errors.js` (`AnchorError`/`ValidationError`/`StateError`), `utils.js` (`checkEngineState` anchor, `isFresh` generic), `openApi.json`.

**Shared logic (`shared/`).** Consumed by **both** the Node backend and the browser bundle. `geo.js` (generic great-circle + `bowPosition` bow geometry, turf-only, `{latitude,longitude}` plain objects — the only genuinely app-agnostic file). `scopes.js` (anchor rode ratios). `watch-zones/*` (`WatchZone`/`CircleZone`/`SectorZone`/`PolygonZone` + `watchZoneFromConfig`) — semantically anchor (every `contains(vessel, anchor)`/`getBoundingBox(anchor)` takes an anchor center; `getCircleRadius()` exists only to feed legacy `navigation.anchor.maxRadius`/Freeboard). `shared/` resolves three ways today: bundled into UI by Vite, served cross-tree in dev via `server.fs.allow:[".."]`, and imported by relative path from `src/*` and `node:test`.

**Vite frontend (`ui/`).** `vite.config.js`: `root=ui`, `base="./"` (relative URLs for the `/<pluginName>/` SignalK mount), `outDir=../public` with `emptyOutDir`, **`minify:false` + `sourcemap:true`, and crucially no `build.target`** (a reverse proxy transpiles modern syntax for Chromium-69 Navico MFDs — see §7). `ui/index.html` is the SPA shell: Navico `?mode=night/day` theme bootstrap, Leaflet + plugin includes, `#map_container > (#map, #mapAttribution)`, entry `<script src=js/AnchorAlarm.js>`.

**Composition root + HUD (`ui/js/`).** `AnchorAlarm.js` (797 LOC) is the self-invoking app class (`AnchorAlarm.startup()`): owns the `SignalKHelper` REST client + `SignalKStream` websocket, `AppState`, the 500ms update loop, config load/save, login/logout modals, and builds the whole Leaflet map (basemaps, layers control, seascape + chart overlays, theme control, home button, status bar, control toolbar, HUD panels). `AppState.js` (531 LOC) is the own-boat state single-source-of-truth (subscription paths, `/self` extraction, delta apply, derived heading/tides/scopes/anchor-estimate, optimistic anchor-write suppression). HUD (`ui/js/hud/`) splits into generic controls (`FleetLayer`, `StatusBar`, `ThemeControl`, `HomeButtonControl`, `ConfigPanel`, `Modal`, `TidePanel`, `WindPanel` — all base-eligible) and anchor controls (`AnchorOverlay`, `ScopePanel`, `InfoPanel`, `ControlToolbar`, `zones/*`). Services (`SignalKHelper`, `SignalKStream`, `DisplayUnit`, `BoatConfig`, `ShipIcons`, `WindBarb`, `ChartLayers`, `SeascapeLoader`, `BrowserSupport`, `StaleReloader`, `GeoMath`) are mostly clean base with a few anchor leaks.

**Build/packaging/tests.** `package.json` (`main=src/index.cjs`, `type:module`, `files:[src,shared,docs/screenshots,public,CHANGELOG.md]`, `signalk{}` block, scripts: `build:ui=vite build`, `test=node --test`, `prepack=build:ui`, `prepublishOnly=npm test`). `scripts/generate-icons.js` (sharp + png-to-ico) reads `branding/anchoralarm.png` (outside `publicDir`, outside `files[]`) and writes committed derived icons into `ui/public/`. Tests: `test/index.test.js` (anchor), `test/schema-config.test.js` (mixed), `test/mockApp.js` (generic SignalK server mock — cleanly reusable), `test/helpers.js` (turf geo fixtures — cleanly reusable). CI: `.github/workflows/signalk-ci.yml` (reuses SignalK plugin-ci) + `publish.yml` (on `v*` tag).

---

## 3. What is base vs app

Classification is grounded in the module map's per-file `classification`/`couplingToAnchor`, with the risk-analysis corrections applied. **`needs-splitting`** means the file has base and anchor concerns interleaved *within methods/objects* and must be carved, not moved.

| Module | Verdict | Notes / seam |
|---|---|---|
| `src/signalk-bus.js` | **base** | Move as-is. Pure delta/meta batching keyed on `(app, pluginId)`. |
| `src/watchdog.js` | **base** | Move as-is. Generic resettable timer. |
| `src/errors.js` | **base** (rename) | `AnchorError`→`PluginError`; keep `ValidationError`/`StateError`. Anchor app aliases `export class AnchorError extends PluginError`. |
| `src/utils.js` | split | `isFresh`→base; `checkEngineState` stays anchor (engine-override is an anchor feature). |
| `src/index.js` | **needs-splitting** (hard) | Base seam = lifecycle skeleton + `SignalKBus` bootstrap + `navigation.position` subscription helper. Everything else (`updateAnchorState`/`checkPosition`/`dropAnchor`/`setZone`/`raiseAnchor`/`computeBowMetrics`/`navigation.anchor.*`) is anchor. |
| `src/schema.js` | **needs-splitting** (moderate) | Engine (`coerceToSchema`/`coerceUiConfig`/`pickUiConfig`/`applyDefaults`/`pathChecks` loop) + base key fragment → base. Anchor fragment + `metas` + anchor `requiredPaths` + `migrateConfig`/`readZoneConfig` → app. |
| `src/http-routes.js` | **needs-splitting** (moderate) | Icon subsystem + `/ui-config` + `fail()` (keyed on `PluginError`) → base `registerBaseRoutes`. `/dropAnchor`,`/setZone`,`/raiseAnchor` → app `registerRoutes`. |
| `src/openApi.json` | split | Base fragment (`/icon`, `/ui-config`, shared Config/response components) + per-app fragment (anchor paths, `info.title`/`servers`); merge at `getOpenApi()`. |
| `src/index.cjs` | app (per-app boilerplate) | Each app keeps its own shim. |
| `shared/geo.js` | **base** | Move as-is (reword anchor header comment). Contract: dual-runtime, turf-only, `{latitude,longitude}`, no Node builtins, no Leaflet. |
| `shared/scopes.js` | **anchor** | Move into anchor app tree (out of `shared/`). Rode ratios — no meaning in a plotter base. |
| `shared/watch-zones/*` | **anchor** | Move into anchor app tree. Anchor-centered `contains()`/`getBoundingBox()` + legacy `getCircleRadius()`. |
| `ui/js/SignalKStream.js` | **base** | Move as-is. |
| `ui/js/SignalKHelper.js` | split (trivial) | Base minus 3 anchor verbs (`raiseAnchor`/`dropAnchor`/`setZone` — one-liners over `pluginPost`). Fix anchor comment in `_toJsonOrReject`. |
| `ui/js/Theme.js` | **base** | Move as-is. |
| `ui/js/DisplayUnit.js` | **base** | Move as-is. Note import-time `loadActive('')` same-origin assumption (fine for both apps). |
| `ui/js/ChartLayers.js` | **base** | Move as-is; reword pane-stack comments. |
| `ui/js/SeascapeLoader.js` | **base** | Move as-is. CH69 `supportsMaplibre()` gate load-bearing (§7). |
| `ui/js/ShipIcons.js` | **base** | Move as-is with `icons/ships/png` assets. |
| `ui/js/WindBarb.js` | **base** | Move as-is. |
| `ui/js/BrowserSupport.js` | **base** | Move as-is; reword `AnchorAlarm` example comment. Load-bearing CH69/Navico gates. |
| `ui/js/StaleReloader.js` | **base** | Move as-is; reword comment. |
| `ui/js/BoatConfig.js` | split (easy) | Base = geometry/identity/icon. Anchor = `anchorRollerHeight`/`totalAnchorChainLength` (two leaf fields in `extract()`) → extension-extractor hook or `AnchorApp` subclass. |
| `ui/js/GeoMath.js` | split (trivial) | `calculateBowCoordinates`→base; `estimateTideHeightSmooth`→base (generic tide util, travels with `TidePanel`). |
| `ui/js/AppState.js` | **needs-splitting** (moderate) | Base `VesselState` (position/heading/depth/wind/tide extraction, delta apply, fleet subscription, `cleanDisplayUnits`, `getSubscriptionPaths()` hook). Anchor `AnchorState extends VesselState` (anchor envelopes, optimistic-write suppression, scopes, watch-zone, anchor estimate, `calculateScopes` in overridden `calculate()`). |
| `ui/js/AnchorController.js` | **anchor** | Reference impl of an app action controller. Stays. |
| `ui/js/AnchorAlarm.js` | **needs-splitting** (hard) | Base `PlotterApp` (networking, `init()`, layers, auth, update loop) + `AnchorApp extends PlotterApp` (panels/overlay/controller, `isAnchored()` swap, anchor config defaults). |
| `ui/js/hud/Modal.js` | **base** | Move as-is. Keystone CH69-safe dialog. |
| `ui/js/hud/HomeButtonControl.js` | **base** | Move as-is. Already a pure `onHome` hook. Optionally parameterize title/icon. |
| `ui/js/hud/ThemeControl.js` | **base** | Move as-is with `Theme.js`. |
| `ui/js/hud/FleetLayer.js` | **base** (easy) | Move as-is; loosen constructor from whole `app` to injected `{signalK, getOwnPosition/getBoatConfig, statusReporter}`. |
| `ui/js/hud/TidePanel.js` | **base** | Move as-is; optionally parameterize `TIDES_HREF`. |
| `ui/js/hud/WindPanel.js` | **base** | Move as-is (extend `HudPanel`). Not anchor at all — generic AWS/TWA widget. |
| `ui/js/hud/StatusBar.js` | split (easy) | Class + `set`/`clear`/`logError`/`_render` + generic marine staleness → base. `anchor.notification`→`notice-status` banner mapping → `AnchorApp.onUpdate`. |
| `ui/js/hud/ConfigPanel.js` | split (moderate) | Form engine + icon row + auth/version hooks → base. Module-level `FIELDS` constant + version string → injected per app. |
| `ui/js/hud/ControlToolbar.js` | **anchor** (reclassified) | Raise/drop + shape picker + zones wiring. Not COMMON. Stays. |
| `ui/js/hud/InfoPanel.js` | split (easy) | Depth row → base helper/panel. `setStatus(anchor)` → anchor. Extend `HudPanel`. |
| `ui/js/hud/ScopePanel.js` | **anchor** (easy) | Content anchor; extend base `HudPanel`. |
| `ui/js/hud/zones/index.js` | **anchor** (moderate) | Registry mechanism is generic but has one consumer → keep in app. Only decouple `createDefaultZoneConfig` from `appState.getDefaultRadius()` (pass radius in). |
| `ui/js/hud/zones/ZoneHandle.js` | **base** | Move as-is (generic draggable dot). Optionally rename CSS to `mapHandle`. |
| `ui/js/hud/zones/*Zone{Overlay,Controls}.js` | **anchor** | Stay. Concrete watch-zone editors/overlays. |
| `ui/js/hud/zones/PolygonZoneOverlay.js` | **anchor** (hard) | Stays. Export `regularPolygonVertices` (pure helper) — optionally to base. |
| `ui/js/hud/AnchorOverlay.js` | **anchor** (hard) | Stays. Structurally generic feature-overlay but anchor-saturated. Do **not** generalize to a base `FeatureOverlay` now. |
| `vite.config.js` | **base** (factory) | Move to base as `createViteConfig({root,outDir})`; app spreads it. |
| `eslint.config.js` | **base** | Move to repo root / base; `ui/js` browser+`L` profile reused. |
| `test/mockApp.js` | **base** | Move to base. Generic SignalK server mock. |
| `test/helpers.js` | **base** | Move to base. Rename `ANCHOR`→`ORIGIN`. |
| `test/index.test.js` | **anchor** | Stays. |
| `test/schema-config.test.js` | split (moderate) | Framework tests (coerce/whitelist/defaults) → base with neutral fields. Anchor assertions (zone migration, scope/alarm defaults) → app. |
| `scripts/generate-icons.js` | base (mechanism) | Mechanism → base; per-app master/manifest/`signalk{}` stay app. |
| `package.json`, `README.md`, `site.webmanifest`, `openApi.json` title/servers, `branding/*`, screenshots | **anchor/per-app** | Stay per app. |

**Hard/mixed callouts:** the three big files (`index.js`, `AnchorAlarm.js`, `AppState.js`) are `needs-splitting` with seams *through* methods; `schema.js`/`http-routes.js`/`ConfigPanel.js`/`StatusBar.js`/`BoatConfig.js` are mixed with clean function/field-level seams. **Corrections to the user-declared classification:** `ControlToolbar` is anchor (not common); of `shared/`, only `geo.js` is base.

---

## 4. Recommended architecture

### 4.1 Packaging / repo shape

```
hoekens-anchor-alarm/                 (git repo root; "private": true, "workspaces": ["packages/*"])
├─ package.json                       (workspace root: shared devDeps, root scripts, lockfile)
├─ eslint.config.js                   (shared across workspaces)
├─ packages/
│  ├─ base/                           name "signalk-leaflet-base", "private": true (UNPUBLISHED)
│  │  ├─ package.json                 (exports map: ./ui/*, ./backend, ./geo, ./vite-config, ./test-utils)
│  │  ├─ backend/                     createPlugin, SignalKBus, Watchdog, errors(PluginError),
│  │  │                               http-routes(base), schema(engine + composeSchema + base fragment),
│  │  │                               openApi fragment, positionWatcher
│  │  ├─ ui/                          PlotterApp, VesselState, services, hud/(generic), HudPanel, index.html template
│  │  ├─ geo.js                       (moved from shared/)
│  │  ├─ scripts/generate-icons.js    (mechanism)
│  │  ├─ vite-config.js               createViteConfig({root, outDir})
│  │  └─ test-utils/                  mockApp.js, helpers.js
│  ├─ hoekens-anchor-alarm/           existing published SignalK package
│  │  ├─ package.json                 (signalk{}, name, deps + bundledDependencies: signalk-leaflet-base)
│  │  ├─ src/                         index.cjs, index.js (createPlugin + anchor spec), anchor-service.js,
│  │  │                               schema-fragment.js (+ migrateConfig/readZoneConfig), utils(checkEngineState)
│  │  ├─ shared/                      scopes.js, watch-zones/*  (moved out of top-level shared/)
│  │  ├─ ui/                          index.html, js/AnchorApp.js, js/AnchorState.js, js/AnchorController.js,
│  │  │                               js/hud/(AnchorOverlay, ScopePanel, InfoPanel, ControlToolbar, zones/*)
│  │  ├─ branding/anchoralarm.png
│  │  └─ vite.config.js               spreads base createViteConfig
│  └─ super-simple-plotter/           new published SignalK package
│     ├─ package.json                 (signalk{}, name, deps + bundledDependencies)
│     ├─ src/                         index.cjs, index.js (createPlugin + minimal spec)
│     ├─ ui/                          index.html, js/Plotter.js (thin subclass)
│     ├─ branding/plotter.png
│     └─ vite.config.js
```

**Why unpublished/workspace-internal + `bundledDependencies`.** The two constraints that actually discriminate the options — "don't maintain duplicated code" and "minimize ceremony for a solo maintainer" — are jointly maximized only by an internal base. A *published* base would force lockstep releases (bump base → `npm publish` base → bump dep in both apps → republish both) for every shared backend fix before it reaches a boat. Keeping base unpublished eliminates that. The frontend never needs base at runtime (Vite inlines it into each app's `public/`), so the only thing that must be physically present in the installed tarball is the small backend core; `bundledDependencies` packs it in. Each app still publishes to the appstore independently, exactly as today.

**Why not multi-repo / submodule.** Submodules can't be resolved by npm on a user's SignalK server and are painful solo. Multi-repo + published dep reintroduces the lockstep dance. Workspaces give one clone, one lockfile, one `npm install`, one lint/test config, atomic cross-package refactors, and dev-time base resolution via symlink without publish churn.

### 4.2 Backend sharing + extension mechanism

Base exports a lifecycle harness that replaces the hand-rolled skeleton in `src/index.js`:

```js
// signalk-leaflet-base/backend/createPlugin.js
import { SignalKBus } from "./SignalKBus.js";
import { Watchdog } from "./Watchdog.js";
import { registerBaseRoutes } from "./http-routes.js";
import { composeSchema, applyDefaults, baseSchemaFragment } from "./schema.js";
import { baseOpenApi, mergeOpenApi } from "./openApi.js";
import { subscribePosition } from "./positionWatcher.js";

export function createPlugin(app, spec) {
  // spec = { id, name, description, schema, metas, migrate, onStart, onStop, routes, openApi, watchPosition }
  const plugin = { id: spec.id, name: spec.name, description: spec.description };
  plugin.bus = new SignalKBus(app, plugin.id);
  plugin.schema = () => composeSchema(baseSchemaFragment(app), spec.schema ?? {});
  plugin.getOpenApi = () => mergeOpenApi(baseOpenApi, spec.openApi);

  let ctx, teardown = [];
  plugin.start = (options) => {
    const props = spec.migrate ? spec.migrate(options) : options;
    plugin.configuration = applyDefaults(app, plugin.schema(), props);
    ctx = { app, plugin, config: plugin.configuration, bus: plugin.bus, teardown };
    for (const [path, meta] of Object.entries(spec.metas ?? {})) plugin.bus.queueMeta(path, meta);
    if (spec.watchPosition) {                        // generic navigation.position subscription + no-data dog
      const dog = spec.watchPosition.noDataMs
        ? new Watchdog(spec.watchPosition.noDataMs, () => spec.watchPosition.onNoData?.(ctx)) : null;
      dog?.start();
      teardown.push(subscribePosition(app, {
        period: spec.watchPosition.period ?? 1000,
        onPosition: (p) => { dog?.reset(); spec.watchPosition.onPosition(ctx, p); },
      }));
      if (dog) teardown.push(() => dog.stop());
    }
    spec.onStart?.(ctx);
    app.setPluginStatus?.(spec.startedStatus ?? "Running");
  };
  plugin.stop = () => { spec.onStop?.(ctx); teardown.forEach((f) => f()); teardown = []; };
  plugin.registerWithRouter = (router) => {
    registerBaseRoutes(app, plugin, router);          // /icon (GET/PUT/DELETE), /ui-config (GET/POST), fail()→PluginError
    spec.routes?.(router, ctx);                        // app routes
  };
  return plugin;
}
```

The **anchor plugin** (`packages/hoekens-anchor-alarm/src/index.js`) becomes:

```js
import { createPlugin } from "signalk-leaflet-base/backend";
import { anchorSchemaFragment, migrateConfig } from "./schema-fragment.js";
import { anchorMetas } from "./metas.js";
import { AnchorService } from "./anchor-service.js";   // updateAnchorState, checkPosition, dropAnchor/setZone/raiseAnchor, computeBowMetrics, engine override

export default function (app) {
  let svc;
  return createPlugin(app, {
    id: "anchoralarm", name: "Anchor Alarm", description: "...",
    schema: anchorSchemaFragment, metas: anchorMetas, migrate: migrateConfig,
    onStart: (ctx) => { svc = new AnchorService(ctx); svc.restore(); },
    onStop:  () => svc?.dispose(),
    watchPosition: { period, noDataMs, onPosition: (ctx, p) => svc.checkPosition(p), onNoData: (ctx) => svc.noPositionAlarm() },
    routes: (router, ctx) => svc.registerRoutes(router),   // /dropAnchor, /setZone, /raiseAnchor
    openApi: anchorOpenApiFragment,
  });
}
```

The `navigation.anchor.*` delta namespace and `notifications.navigation.anchor` never enter base. `computeBowMetrics` moves to base as a generic bow-geometry helper parameterized on a target position (reads `navigation.headingTrue` + `sensors.gps.fromCenter/fromBow`, delegates to `Geo`); the anchor app calls it against the anchor position.

The **plotter plugin** (`packages/super-simple-plotter/src/index.js`) is ~15 lines:

```js
import { createPlugin } from "signalk-leaflet-base/backend";
export default function (app) {
  return createPlugin(app, { id: "supersimpleplotter", name: "Super Simple Plotter", description: "...", schema: {} });
  // no watchPosition, no metas, no app routes — base registers /ui-config + /icon so the settings form and custom boat icon persist
}
```

### 4.3 Frontend app-shell + extension mechanism

`AnchorAlarm.js` splits into base `PlotterApp` + `AnchorApp extends PlotterApp`. Base owns the entire generic lifecycle; the subclass overrides a fixed set of protected hooks called by base at fixed points.

```js
// signalk-leaflet-base/ui/PlotterApp.js
export class PlotterApp {
  constructor({ pluginName }) {
    this.signalK = new SignalKHelper({ pluginName, onUnauthorized: () => this.showLoginModal() });
    this.stream  = new SignalKStream();
    this.state   = this.createState();
    this.config  = { ...this.getDefaultConfig() };
  }

  // ---- identity / config hooks ----
  createState() { return new VesselState(); }
  getDefaultConfig() {
    return { defaultBasemap: "Satellite", fleetFilterRadius: 500,
             enableChartLayers: true, enableSeascape: false, enableBoatLabels: true, hasCustomIcon: false };
  }
  getConfigFields() { return []; }        // appended to BASE_FIELDS inside ConfigPanel (§6)

  // ---- build hooks (called once, at the end of buildMap) ----
  buildControls(map) {}                    // app adds ControlToolbar etc. (base already added config/theme/home/zoom/layers)
  buildPanels(map) {}                      // app adds L.Control panels + overlays + controllers

  // ---- lifecycle hooks ----
  onInitialData(state) {}                  // after loadConfig, before first fitBounds
  getHomeView(map) { const p = this.state.getPosition(); if (p) map.setView(p); }  // Home button + initial view
  onUpdate(state) {}                       // per-tick, after base updates StatusBar/FleetLayer/Tide/Wind
  onConfigSaved(config) {}                 // after saveConfig persists

  // ---- base-owned, not overridden ----
  async startup() { /* setupWebsockets → init → loadInitialData → setupConnection(500ms) */ }
  init() { /* basemaps, CHART_PANE, L.map, isNavicoMfd()→reverseScrollWheelZoom/negateWheelDelta, StatusBar */ }
  buildMap(map) {
    this.configPanel = new ConfigPanel({ fields: [...BASE_FIELDS, ...this.getConfigFields()].filter(f => f.ui),
      getConfig: () => this.config, onChange: (c) => this.saveConfig(c), getVersion: () => this.version,
      versionLabel: this.getVersionLabel?.(), getIconUrl: ..., onUploadIcon: ..., onDeleteIcon: ...,
      getLoggedIn: ..., onLogin: () => this.showLoginModal(), onLogout: () => this.logout() }).addTo(map);
    this.layersControl = L.control.layers(this.baseMaps, {}).addTo(map);
    this.addSeascapeLayer(map); this.addChartLayers(map);
    new ThemeControl().addTo(map);
    this.homeButton = new HomeButtonControl({ onHome: (m) => this.getHomeView(m) }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    this.fleetLayer = new FleetLayer({ signalK: this.signalK, getOwnPosition: () => this.state.getPosition(),
      getBoatConfig: () => this.state.boatConfig, statusReporter: this.statusBar,
      filterRadius: this.config.fleetFilterRadius, showLabels: this.config.enableBoatLabels });
    if (this.config.enableTidePanel) this.tidePanel = new TidePanel().addTo(map);
    if (this.config.enableWindPanel) this.windPanel = new WindPanel().addTo(map);
    this.buildPanels(map); this.buildControls(map);     // ← app extension points, last
  }
  updateMap() {
    this.statusBar.update(this.state); this.fleetLayer.update(this.state);
    this.tidePanel?.update(this.state); this.windPanel?.update(this.state);
    this.onUpdate(this.state);                            // ← app cross-panel coordination, last
  }
}
```

`AnchorApp` is then ~120 lines:

```js
// packages/hoekens-anchor-alarm/ui/js/AnchorApp.js
import { PlotterApp } from "signalk-leaflet-base/ui/PlotterApp.js";
import { AnchorState } from "./AnchorState.js";
import { ANCHOR_FIELDS } from "./config-fields.js";
import { ControlToolbar } from "./hud/ControlToolbar.js";
import { AnchorOverlay } from "./hud/AnchorOverlay.js";
import { InfoPanel } from "./hud/InfoPanel.js";
import { ScopePanel } from "./hud/ScopePanel.js";
import { AnchorController } from "./AnchorController.js";

class AnchorApp extends PlotterApp {
  createState() { return new AnchorState(); }
  getDefaultConfig() { return { ...super.getDefaultConfig(), defaultShape: "circle",
    enableTidePanel: true, enableWindPanel: true, enableScopePanel: true, scopes: "7,5,4,3" }; }
  getConfigFields() { return ANCHOR_FIELDS; }
  getVersionLabel() { return "Hoeken's Anchor Alarm"; }

  onInitialData(state) { state.setScopeRatios(this.config.scopes); state.calculateScopes(); }

  buildPanels(map) {
    this.infoPanel  = new InfoPanel().addTo(map);
    this.scopePanel = new ScopePanel().addTo(map);
    this.anchorOverlay = new AnchorOverlay({ map, state: this.state,
      onZoneChange: (c) => this.anchorController.setZone(c), onZoneInput: (c) => this.anchorController.previewZone(c) });
    this.anchorController = new AnchorController({ appState: this.state, signalK: this.signalK, overlay: this.anchorOverlay });
  }
  buildControls(map) {
    this.toolbar = new ControlToolbar({ appState: this.state,
      onDrop: () => this.anchorController.requestDrop(), onRaise: () => this.anchorController.requestRaise(),
      onSetZone: (c) => this.anchorController.setZone(c), onLogin: () => this.showLoginModal() }).addTo(map);
  }
  getHomeView(map) { this.anchorController.estimateAnchorPosition(); map.fitBounds(this.anchorOverlay.getBounds()); }
  onUpdate(state) {
    this.toolbar.update(state); this.anchorOverlay.update(state);
    const anchored = state.isAnchored();               // info↔scope panel swap
    anchored ? (this.infoPanel.hide(), this.scopePanel.show()) : (this.scopePanel.hide(), this.infoPanel.show());
    this.infoPanel.setStatus(state.anchor);
    const n = state.anchor?.notification?.value;         // anchor.notification → status banner (moved out of base StatusBar)
    if (n) this.statusBar.set("notice-status", n.message, n.state); else this.statusBar.clear("notice-status");
  }
  onConfigSaved(config) { this.state.setScopeRatios(config.scopes); this.state.calculateScopes(); this.anchorOverlay.setDefaultShape(config.defaultShape); }
}
AnchorApp.startup();
```

`SuperSimplePlotter` is ~10 lines:

```js
// packages/super-simple-plotter/ui/js/Plotter.js
import { PlotterApp } from "signalk-leaflet-base/ui/PlotterApp.js";
class Plotter extends PlotterApp {
  constructor() { super({ pluginName: "super-simple-plotter" }); }
  getVersionLabel() { return "Super Simple Plotter"; }
  // optionally: getDefaultConfig() { return { ...super.getDefaultConfig(), enableTidePanel: false, enableWindPanel: false }; }
}
Plotter.startup();
```

**Panel/control/layer/route/schema "registration".** Deliberately **not** a registry framework (rejected as one-consumer YAGNI — see §9/§11). Instead:
- **Panels/controls**: added imperatively inside `buildPanels`/`buildControls` (app calls `.addTo(map)`); base provides the `HudPanel` base class so panels share L.Control boilerplate.
- **Layers**: base owns basemaps + chart + seascape unconditionally, gated by base config keys.
- **Routes**: backend `spec.routes(router, ctx)` appends to the same Express router after `registerBaseRoutes`.
- **Schema**: `composeSchema(baseFragment, appFragment)` (§6).
- **Home-button override hook**: `getHomeView(map)` — base default centers on boat; `AnchorApp` overrides to estimate anchor + `fitBounds(anchorOverlay.getBounds())`. This is precisely the "base behavior, each app can override" requirement.

**`HudPanel` base class** (extracted from the identical `L.Control.extend` boilerplate in `InfoPanel`/`ScopePanel`/`WindPanel`), template-literal-HTML per project convention:

```js
// signalk-leaflet-base/ui/hud/HudPanel.js
export const HudPanel = L.Control.extend({
  onAdd() {
    const c = L.DomUtil.create("div", this.options.className ?? "hudPanel");
    c.id = this.options.id;
    L.DomEvent.disableClickPropagation(c);
    c.innerHTML = this.options.template;                 // template-literal HTML string
    this._refs = {};
    for (const [name, sel] of Object.entries(this.options.refs ?? {})) this._refs[name] = c.querySelector(sel);
    this._container = c;
    return c;
  },
  show() { this._container.style.display = ""; },
  hide() { this._container.style.display = "none"; },
  update(state) { this.options.update?.(this._refs, state); },
});
```

`WindPanel` and `TidePanel` become base panels built on `HudPanel`; `InfoPanel` (depth row base helper + anchor `setStatus`) and `ScopePanel` stay in the anchor app but extend the base `HudPanel`.

### 4.4 How `AnchorAlarm.js` decomposes

| Current `AnchorAlarm.js` responsibility | Destination |
|---|---|
| `SignalKHelper`/`SignalKStream` construction, `onUnauthorized` | `PlotterApp` constructor (base) |
| `normalizeContext`, `handleDeltas` (self vs fleet routing), `setupWebsockets` | `PlotterApp` (base) |
| `init()` basemaps/panes/`CHART_PANE`/`L.map`, `StaleReloader`, `StatusBar`, Navico `reverseScrollWheelZoom`/`negateWheelDelta`, `fetchPluginInfo`/version | `PlotterApp.init()` (base) |
| `loadInitialData` retry loop, `loadConfig`, `setupConnection` + 500ms timer | `PlotterApp` (base) |
| `showLoginModal`/`logout`, `uploadBoatIcon`/`deleteBoatIcon`, `saveConfig` (generic part) | `PlotterApp` (base) |
| `addSeascapeLayer`/`setSeascapeEnabled`, `addChartLayers`/`updateChartLayers`, `setBasemap`, `updateAttribution`, `ThemeControl`, `HomeButtonControl`, `L.control.zoom`/`layers`, `FleetLayer`, `ConfigPanel` | `PlotterApp.buildMap()` (base) |
| `TidePanel`/`WindPanel` (config-gated) | `PlotterApp.buildMap()` (base, optional) |
| config `defaults` literal — `defaultShape`/`scopes`/`enable*Panel` | `AnchorApp.getDefaultConfig()` (app) |
| `buildMap()` `infoPanel`/`scopePanel`/`anchorOverlay`/`anchorController` block | `AnchorApp.buildPanels()`/`buildControls()` (app) |
| `updateMap()` `isAnchored()` panel-swap + `anchorOverlay.update` + notification banner | `AnchorApp.onUpdate()` (app) |
| `loadInitialData` `setScopeRatios`/`calculateScopes` | `AnchorApp.onInitialData()` (app) |
| initial `fitBounds(anchorOverlay.getBounds())` + `homeButton.onHome` → `estimateAnchorPosition` | `AnchorApp.getHomeView()` (app) |
| `saveConfig` anchor re-render (`setScopeRatios`/`setDefaultShape`) | `AnchorApp.onConfigSaved()` (app) |

`AppState` mirrors this: base `VesselState` (position/heading/depth/wind/tide extraction, delta-apply envelope, fleet subscription, `cleanDisplayUnits`, a `getSubscriptionPaths()` hook subclasses append to, and an overridable `onCalculate()`/heading-fallback hook) vs `AnchorState extends VesselState` (anchor envelopes, optimistic-write suppression, scopes via app `scopes.js`, watch-zone via app `watch-zones/*`, anchor estimate, `calculateScopes` in the overridden `calculate()`). `computeOwnHeading`'s `anchor.position` fallback becomes an overridable heading-fallback hook so base has no anchor knowledge.

---

## 5. Per-concern handling

Each user-declared common feature, with exact location and consume/override mechanism.

- **Settings UI / schema.** Engine in base: backend `composeSchema`/`coerceUiConfig`/`pickUiConfig`/`applyDefaults`/`pathChecks`; frontend `ConfigPanel` form engine + icon row + auth/version hooks. Base owns `BASE_FIELDS` + the base schema fragment. Apps consume by returning `getConfigFields()` (frontend) and passing an app schema fragment (backend). Override = add/remove fields; the render/persist/validate plumbing is untouched. (Full detail §6.)

- **Layers incl. local charts + Seascape bathymetry.** Fully base. `ChartLayers.js` (`loadChartLayers`/`chartToLayerSpec`/`CHART_PANE`) + `SeascapeLoader.js` (gated on `BrowserSupport.supportsMaplibre()` so CH69 MFDs skip WebGL) + `PlotterApp.addChartLayers`/`updateChartLayers`/`addSeascapeLayer`/`setSeascapeEnabled`/`setBasemap` + `L.control.layers` baseMaps. Consumed free; gated by base config keys `defaultBasemap`/`enableChartLayers`/`enableSeascape`. No app override expected.

- **Light/dark mode + selector.** `Theme.js` + `hud/ThemeControl.js` → base, added unconditionally in `buildMap()`. The Navico `?mode=night/day` bootstrap script lives in the base `index.html` template head; each app's `index.html` inherits it. No per-app override.

- **Home button + override.** `hud/HomeButtonControl.js` → base (already a pure `onHome` hook, no built-in recenter). Base wires `onHome → this.getHomeView(map)`; base default centers on boat. `AnchorApp` overrides `getHomeView()` to estimate anchor + `fitBounds(anchorOverlay.getBounds())`. This is the canonical "base behavior, app override" seam.

- **Zoom controls.** `L.control.zoom({position:"topright"})` added in base `buildMap()`; Navico `reverseScrollWheelZoom` + `negateWheelDelta` in base `init()` gated on `isNavicoMfd()`. Pure Leaflet/Navico, no per-app config.

- **Status bar + set/clear errors.** `hud/StatusBar.js` class + `set`/`clear`/`logError`/`_render` + the generic marine staleness checks (gps/heading/depth/wind) → base; base `updateMap()` calls `statusBar.update(state)`. The **only** anchor-specific block — `state.anchor.notification` → `notice-status` banner — moves out into `AnchorApp.onUpdate()` calling `statusBar.set("notice-status", …)`. Apps consume by calling `statusBar.set/clear` for their own keyed items.

- **Login / logout.** `SignalKHelper.login/logout` + 401→`onUnauthorized` flow + `PlotterApp.showLoginModal`/`logout`/`loadConfig` + `ConfigPanel`'s Log out/Login footer → all base (auth, not anchor). Both apps get identical in-app login. No override.

- **Custom boat icon.** Base: `SignalKHelper.boatIconUrl`/`uploadBoatIcon`/`deleteBoatIcon` + backend `/icon` GET/PUT/DELETE routes (magic-byte sniff `sniffIconType`/`iconPath`/`readBodyBytes`/`ICON_TYPES`, size-capped body, keyed on `app.getDataDirPath()`) + `BoatConfig.icon` via `ShipIcons.js` + `ConfigPanel` icon row + `PlotterApp.uploadBoatIcon`/`deleteBoatIcon`. The two anchor `BoatConfig` fields (`anchorRollerHeight`/`totalAnchorChainLength`) come out of base `extract()` via an extra-extractor hook or an `AnchorApp`-side `BoatConfig` subclass. Both apps get custom icons free.

- **Fleet layer + historical tracks.** `hud/FleetLayer.js` → base, loosened from `{app}` to injected `{signalK, getOwnPosition, getBoatConfig, statusReporter, filterRadius, showLabels}`. `BoatMarker`/`hotline`/`simplify-js`/`BoatConfig`/`DisplayUnit` travel with it. Gated by base config `fleetFilterRadius`/`enableBoatLabels`. `@signalk/tracks-plugin` stays a per-app `recommends`. Both apps get fleet/tracks free.

- **SignalK helper / stream classes.** `SignalKStream.js` → base as-is. `SignalKHelper.js` → base **minus** `raiseAnchor`/`dropAnchor`/`setZone` (one-liners over the public `pluginPost`). The anchor app calls `signalK.pluginPost("dropAnchor", {...})` directly (or defines the three verbs on a tiny subclass). `pluginName` already parameterizes the plugin route base path, so the helper is app-name-agnostic. `handleDeltas`/`normalizeContext` self-vs-fleet routing lives in `PlotterApp`.

---

## 6. Config schema strategy

One reusable schema system, split into an engine + composable fragments, single-source across the three current duplication sites (backend property defs, backend `UI_CONFIG_KEYS` whitelist, frontend `ConfigPanel.FIELDS`). We deliberately do **not** invent a unified declarative field-spec DSL (rejected as novel indirection); we use the lighter `composeSchema` + injected-`FIELDS` path and steal one cheap dedup from the registry proposal: **derive `UI_CONFIG_KEYS` from the merged schema**.

**Backend.** Base owns the generic machinery unchanged (`coerceToSchema`, `coerceUiConfig`, `pickUiConfig`, `applyDefaults`, the `pathChecks` ✅/❌ generation loop) plus a base schema fragment (`defaultBasemap`, `fleetFilterRadius`, `enableChartLayers`, `enableSeascape`, `enableBoatLabels`, their generic `requiredPaths`: `navigation.position`, `design.beam/length/aisShipType`, `sensors.gps.*`). New helper:

```js
export function composeSchema(baseFragment, appFragment) {
  return {
    type: "object",
    properties: { ...baseFragment.properties, ...appFragment.properties },
    // requiredPaths concatenated; pathChecks regenerated over the union
    _requiredPaths: [...(baseFragment.requiredPaths ?? []), ...(appFragment.requiredPaths ?? [])],
  };
}
// UI_CONFIG_KEYS derived, not hand-maintained:
export const uiConfigKeys = (schema) => Object.keys(schema.properties).filter((k) => schema.properties[k]["x-ui"] === true);
```

Each schema property carries an `"x-ui": true|false` flag (a plain JSON-Schema extension key, invisible to the server form renderer) that marks whether it flows through `/ui-config`. The anchor fragment marks `defaultShape`/`scopes`/`enableScopePanel`/`enableTidePanel`/`enableWindPanel` as `x-ui:true` and `state`/`enableEngineCheck`/`allowZoneOutsideVessel`/`anchorAlarmInterval`/`noPositionAlarmTime`/`bowAnchorRollerHeight`/`totalAnchorChainLength`/`zone` as `x-ui:false` (present in the server's config form, hidden from the web UI). `coerceUiConfig`/`pickUiConfig`/`applyDefaults` all operate on the merged schema, so per-app whitelists fall out of the fragment union with nothing to keep in sync. Anchor-only `migrateConfig` (v2.1 `radius`→circle zone) and `readZoneConfig` stay in the anchor app and are passed to the harness via `spec.migrate`.

**Frontend.** `ConfigPanel` is already a schema-driven engine (`_rowHtml`/`_collect`/`_populate`/`_onFieldChange` over a `FIELDS` array of `{key,label,type,options,…}`). The only change: `FIELDS` becomes a constructor option fed by `[...BASE_FIELDS, ...app.getConfigFields()].filter(f => f.ui)`. Base exports `BASE_FIELDS`; `AnchorApp.getConfigFields()` returns `ANCHOR_FIELDS` (Watch-Zone-Shape select, Scope-Ratios text, `enableScopePanel`). `getVersion`/`versionLabel`/npm link become options. The base fragment and `BASE_FIELDS` are kept structurally parallel (same keys/enums) so backend validation and frontend form never drift; a base unit test asserts the two key-sets match.

**`super-simple-plotter`** passes an empty (or tiny) backend fragment and `getConfigFields()` returning `[]`, and gets a working map-only settings dialog for free.

**OpenAPI.** Base ships a fragment (paths `/icon`, `/ui-config`; shared `Config`/`SuccessResponse`/`ErrorResponse`/`InternalError` components); each app merges its own paths (anchor control) and overrides `info.title`/`servers` at `getOpenApi()` time via a small deep-merge, replacing the hand-maintained flat `openApi.json`.

---

## 7. Build & packaging plan

**Vite.** Base exports `createViteConfig({ root, outDir })` preserving the current shape exactly: `base:"./"` (relative URLs for the `/<pluginName>/` SignalK mount), `minify:false` + `sourcemap:true`, `assetFileNames`/`entryFileNames: "assets/[name].js"`, and **no `build.target`** and **no `@vitejs/plugin-legacy`**. Each app's `vite.config.js` is a thin spread:

```js
import { createViteConfig } from "signalk-leaflet-base/vite-config";
export default createViteConfig({ root: "ui", outDir: "../public" });
```

**`public/` output.** Unchanged per app: Vite builds `ui/` → `../public/`, `prepack=build:ui` rebuilds on publish, `public/` gitignored and re-emitted. Base UI is imported by the app's `ui/js` via the package specifier (`signalk-leaflet-base/ui/PlotterApp.js`, `.../ui/hud/FleetLayer.js`) and **bundled into the app's `public/`** — identical to how `shared/` is bundled today.

**`shared/` dual-consumption resolution.** Only `geo.js` moves to base (exposed via the base `exports` map as `signalk-leaflet-base/geo`, pure turf-only ESM, no Node builtins, no Leaflet — a frozen contract so both the Node backend and the browser bundle can load it). `scopes.js` + `watch-zones/*` move into the anchor app's own `shared/` (still consumed by the anchor backend and browser bundle via relative import, and by `node:test`). Because base is a **symlinked workspace dep**, all three historical resolution modes keep working: Vite resolves the bare specifier through the symlink (dev) or `node_modules` (build) and bundles it; the Node backend resolves it via `node_modules`; `node:test` resolves it via `node_modules`. `server.fs.allow` narrows to the app's own tree (base now resolves via `node_modules`, not a sibling), or stays `[".."]` harmlessly.

**Icons / branding per app.** The `generate-icons.js` mechanism + the `publicDir`-copy + committed-derived-icons convention move to base as a shared script (sharp/png-to-ico stay devDeps only — normal builds/publishes need no image toolchain since derived icons are committed). Each app keeps its own `branding/<app>.png` master (outside `publicDir`, outside `files[]`), its committed favicons, its `site.webmanifest` `name`/`short_name`, its `index.html` `title`/preloads/entry-script, its `signalk{}` block (`appIcon`, `displayName`, screenshots, `recommends`), and its README.

**npm `files`/keywords.** Base: `files:["backend","ui","geo.js","scripts","vite-config.js","test-utils"]`, `"private": true`, **no** `signalk-*` keywords. Each app: `files:["src","shared","public","docs/screenshots","CHANGELOG.md"]`, `main:"src/index.cjs"`, the `signalk-node-server-plugin`/`signalk-webapp` keywords, its `signalk{}` block, and **`"dependencies": { "signalk-leaflet-base": "*" }` + `"bundledDependencies": ["signalk-leaflet-base"]`** so the backend core is physically packed into the tarball. Release workflow runs `npm pack --dry-run` and **fails if `node_modules/signalk-leaflet-base` is absent** from the pack listing; documented fallback if npm regresses on packing symlinked workspace deps is to esbuild-bundle the backend (target node20, sourcemaps on) or, last resort, publish base for real.

**CH69 reverse-proxy transpile compatibility (hard constraint).** Preserved end-to-end:
1. Base ships its UI as **transpilable ESM source**, never a pre-minified/pre-bundled artifact. Each app's Vite build inlines base source and emits one unminified modern-ESM bundle under `public/` — exactly the artifact the reverse proxy transpiles today. Base is never served as its own separately-proxied origin; it's always inside the app's proxied mount.
2. Base's Vite config keeps **no `build.target`** and **no `plugin-legacy`** — a target would double-transpile and plugin-legacy would inject SystemJS/core-js and change the module format the proxy expects. Both defeat the proxy model.
3. `BrowserSupport.js` moves to base **intact** with its **version-based** gates (`chromiumMajor`), not API-probe gates — because the proxy polyfills runtime APIs, a feature-detect probe falsely passes on CH69. `SeascapeLoader`/MapLibre/WebGL2 (things the proxy cannot rescue — no GPU/engine capability injection) stay gated on `supportsMaplibre()` (`chromiumMajor < 73` + WebGL2 probe). Any new base feature that hard-requires an un-polyfillable API or GPU capability must hide behind the same version gate. A `no-restricted-globals` rule in the base `ui/js` ESLint profile is a cheap safety net.

**ESLint / CI.** `eslint.config.js` shared from base/root (the `ui/js` browser+`L` profile reused verbatim). App packages keep the SignalK plugin-ci reuse + a `publish.yml` keyed to their own CHANGELOG + npm name. Base gets a plain build+lint+test workflow (no plugin-ci reuse; it isn't a plugin). **Add a CI job that runs `build:ui` for BOTH apps against base on every commit** — the cross-app regression net, since `node:test` covers only backend anchor logic and there is no live SignalK testing.

---

## 8. Migration path

Ordered, phased, **bottom-up so the risky composition root is refactored last against an already-green base**. `hoekens-anchor-alarm` is shippable at every checkpoint. Verify each phase via `npm run build:ui` (both apps once they exist) + `node --test` + user-run boat logs — **no live SignalK probing** (per the standing memory).

**Phase 0 — Workspaceize (no behavior change).**
Add root `package.json` (`private`, `workspaces:["packages/*"]`); `git mv` the entire current app into `packages/hoekens-anchor-alarm` unchanged; create empty `packages/base`. Assert `build:ui`, `node --test`, and `npm pack --dry-run` produce a byte-identical anchor-alarm tarball topology. *Checkpoint commit; publishable (unchanged tarball).*

**Phase 1 — Move trivially-clean leaf modules to base.**
Backend: `signalk-bus.js`, `watchdog.js`, `errors.js` (rename `AnchorError`→`PluginError`, anchor app aliases), `shared/geo.js`, `test/mockApp.js`, `test/helpers.js` (`ANCHOR`→`ORIGIN`), `vite.config.js`→`createViteConfig`, `eslint.config.js`. Frontend: `SignalKStream`, `Theme`, `ThemeControl`, `Modal`, `HomeButtonControl`, `BrowserSupport`, `StaleReloader`, `DisplayUnit`, `ShipIcons`, `WindBarb`, `SeascapeLoader`, `ChartLayers`, `ZoneHandle`, `GeoMath.calculateBowCoordinates` (+ `estimateTideHeightSmooth`), `regularPolygonVertices`. Add base to anchor `dependencies`+`bundledDependencies`; rewrite anchor imports to the bare specifier; reword anchor-flavored comments. *Checkpoint; ship a normal release; verify tarball includes base.*

**Phase 2 — Extract HUD/service seams (still shippable).**
Extract `HudPanel` base; move `WindPanel`/`TidePanel` onto it into base. Extract `ConfigPanel` engine to base with injected `FIELDS`. Move `StatusBar` to base (anchor `notification` mapping deferred to app). `SignalKHelper` to base minus the 3 anchor verbs. `FleetLayer` to base (loosened constructor). `BoatConfig` base + anchor-field extension hook. Move `scopes.js` + `watch-zones/*` out of `shared/` into the anchor app tree; fix imports. *Checkpoint; ship.*

**Phase 3 — Backend harness (still shippable).**
Extract `createPlugin` + `subscribePosition` helper + base `http-routes` (icon + `/ui-config` + `fail()`) + schema engine + `composeSchema` + `x-ui`-derived `uiConfigKeys` + base OpenAPI fragment. Rewrite anchor `src/index.js` as `createPlugin(app, anchorSpec)` + `anchor-service.js`. Split `test/schema-config.test.js` (framework tests→base with neutral fields; anchor assertions stay). Keep `test/index.test.js` green. *Checkpoint; ship.*

**Phase 4 — Split `AppState`.**
Base `VesselState` + `AnchorState extends VesselState` (append subscription paths via `getSubscriptionPaths()`, override `calculate()`, heading-fallback hook). Optimistic-write/suppression machinery stays in `AnchorState`. *Checkpoint; ship.*

**Phase 5 — Extract `PlotterApp` (riskiest, LAST).**
Introduce base `PlotterApp` with the hook API; make `AnchorAlarm.js` → `AnchorApp extends PlotterApp`. Get hook ordering right (`onInitialData` before first `fitBounds`; `getHomeView` for both initial view and Home button; `buildPanels`/`buildControls` last in `buildMap`; `onUpdate` last in `updateMap`). Regression-check Navico scroll-reverse, initial `fitBounds`, and the anchored info↔scope swap via build + user-run logs. *Checkpoint; ship anchor on the framework — functionally identical to pre-refactor.*

**Phase 6 — Scaffold `super-simple-plotter`.**
`packages/super-simple-plotter`: thin `Plotter extends PlotterApp` + minimal `createPlugin` spec + own `index.html`/branding/manifest/`signalk{}`/README/screenshots. Wire the both-apps `build:ui` CI job. Publish as a new SignalK package. De-duplication already happened in Phases 1–5, so there is no thin-copy to reconcile. *Checkpoint; publish second app.*

**Phase 7 (ongoing) — Opportunistic dedup.**
Lift any remaining proven-reusable widgets (e.g. the `RadiusStepper`/Modal-prompt duplicated across `CircleZoneControls`/`SectorZoneControls`/`PolygonZoneControls`) into base UI helpers only when a second consumer actually appears.

---

## 9. Hard problems & resolutions

1. **`AnchorAlarm.js` seam runs through methods, not between them.** *Resolution:* inheritance with named hooks (`getDefaultConfig`/`buildControls`/`buildPanels`/`onUpdate`/`getHomeView`/`onInitialData`/`onConfigSaved`); keep `reverseScrollWheelZoom`/`negateWheelDelta`/basemaps/layers/auth/update-timer in base. Do it **last** (Phase 5), against an already-proven base. §4.3.

2. **`shared/` is consumed three ways; only `geo.js` is base.** *Resolution:* workspace so symlinked `node_modules` keeps all three resolution modes without rewriting every import to a fragile bare specifier. Move **only** `geo.js` to base; move `scopes.js` + `watch-zones/*` into the anchor app tree (out of `shared/`). Freeze base `geo` as dual-runtime, turf-only, `{latitude,longitude}`, no Node builtins, no Leaflet. §7.

3. **One flat backend schema mixes base + anchor keys.** *Resolution:* base owns the engine + a base fragment; `composeSchema(baseFragment, appFragment)` merges; `UI_CONFIG_KEYS` derived from the merged schema via `x-ui`; `migrateConfig`/`readZoneConfig` stay anchor. Port the generic half of `schema-config.test.js` to base. §6.

4. **Packaging/versioning ceremony.** *Resolution:* base stays **workspace-internal and unpublished**; frontend bundled by Vite; backend core packed via `bundledDependencies` with an `npm pack --dry-run` gate + esbuild fallback. One source of truth, zero base-publish/lockstep dance. Each app publishes independently. §4.1, §7.

5. **`ControlToolbar` is misclassified as common.** *Resolution:* reclassify to anchor; it stays entirely in the anchor app. A stripped plotter has no toolbar content, so a "generic toolbar shell" would be an empty one-consumer abstraction. `super-simple-plotter` simply has no toolbar (or adds its own later). *Flag this correction to the maintainer.* §3.

6. **Does `super-simple-plotter` ship a backend at all?** *Resolution (default):* yes — a minimal `createPlugin` spec registering base `/ui-config` + `/icon` only (config persistence + custom boat icon), which justifies the backend base extraction. The icon subsystem and `/ui-config` in `http-routes.js` are already app-agnostic, keyed only on `app.getDataDirPath()`. If the maintainer chooses webapp-only, skip the backend base work and split only the frontend. §10-#2.

7. **Tempting-but-premature overlay/shape abstractions.** *Resolution:* leave `AnchorOverlay`, the `zones/index.js` registry, the overlay+handle contract, and `PolygonZoneOverlay`'s insert/merge/self-intersection machinery **in the anchor app**. Extract only genuinely generic leaf primitives to base: `ZoneHandle`, `regularPolygonVertices`, `calculateBowCoordinates`. Generalize the registry only if `super-simple-plotter` later grows on-map editable shapes. §3, §11.

8. **`AppState` split + optimistic-write machinery.** *Resolution:* base `VesselState` with a `getSubscriptionPaths()` override contract and an overridable `calculate()`/heading-fallback hook; `AnchorState` appends `anchor.*` paths + scope math. Keep the optimistic-write/suppression machinery in `AnchorState` (option c) — it's generic in shape but only anchor exercises it. §4.4.

9. **Weak verification (no live SignalK; frontend has no automated coverage).** *Resolution:* move `mockApp.js`/`helpers.js` to base; add base tests for `SignalKBus`, schema coercion, the position-subscription helper, and pure geo (`geo`, `calculateBowCoordinates`). Add CI running `build:ui` for **both** apps against base on every commit so a base change that breaks either app fails fast. Riskiest UI phases verified via build + user-run boat logs. §7, §8.

10. **Per-app branding/icon pipeline + `errors.js` rename.** *Resolution:* base ships the `generate-icons` mechanism + a placeholder `index.html` template + placeholder manifest; each app supplies its own master/manifest/favicons/entry-script/`signalk{}`. `AnchorError`→`PluginError` in base; `http-routes` `fail()` keys 403 off `instanceof PluginError`; anchor app aliases if the name matters. §7, §3.

---

## 10. Open decisions

Each has options + a recommended default. (1)–(3) are load-bearing and should be settled before Phase 3.

1. **Publish `signalk-leaflet-base` to npm, or keep it workspace-internal/unpublished?**
   *Options:* (a) published real dependency — independently reusable by third parties but forces base-bump→app-bump lockstep releases; (b) workspace-internal + `bundledDependencies` — zero base-publish ceremony, base lives only in this monorepo.
   **Recommended: (b).** Revisit only if a genuine external consumer appears.

2. **Does `super-simple-plotter` ship a SignalK backend plugin?**
   *Options:* (a) webapp-only (`signalk-webapp` keyword only), config client-side — most backend base work becomes anchor-only; (b) minimal backend plugin for `/ui-config` + `/icon` persistence — justifies the full backend extraction.
   **Recommended: (b).** The icon + `/ui-config` subsystems are already app-agnostic; a minimal spec is ~15 lines and gives the plotter persisted settings + custom boat icon.

3. **Frontend extension mechanism: inheritance-with-hooks vs registration/composition?**
   *Options:* (a) base `PlotterApp` class + subclass override hooks; (b) base App consuming a declarative `{panels, controls, onUpdate, initialBounds, subscriptionPaths}` object.
   **Recommended: (a).** Closest to the current shape, smallest rewrite of the two hard files, adequate for two apps. Reconsider (b) only for a structurally very different third app.

4. **Build a generic shape/overlay/registry system in base now?**
   *Options:* (a) generalize `AnchorOverlay` + `zones/index.js` + the overlay/handle contract (rename `anchorPosition`→`origin`); (b) leave all overlays/zones in the anchor app, extract only leaf primitives.
   **Recommended: (b).** `super-simple-plotter` needs none of it; designing a reusable API against one consumer is likely wrong.

5. **Where do `watch-zones`/`scopes` physically live post-split?**
   *Options:* (a) inside the anchor app tree (renamed out of `shared/`); (b) a separate anchor-lib package.
   **Recommended: (a).** Only the anchor app consumes them; app-tree is simplest.

6. **Backend `UI_CONFIG` whitelist: hand-maintained per app vs derived from the merged schema?**
   *Options:* (a) keep an explicit whitelist; (b) derive from `x-ui` flags on the merged schema.
   **Recommended: (b).** Single-source; eliminates a drift point without a new abstraction.

7. **Extraction ordering: bottom-up (leaves → geo → HUD → backend → `AppState` → `PlotterApp` last) vs top-down?**
   **Recommended: bottom-up.** Given no live testing, refactor the risky composition root against an already-green base.

8. **`TidePanel`/`WindPanel` in base by default, or opt-in per app?**
   *Options:* (a) base built-ins gated by `enableTidePanel`/`enableWindPanel` config; (b) app-registered.
   **Recommended: (a).** They're marine-generic; `super-simple-plotter` can default them off in `getDefaultConfig()`.

---

## 11. Downsides & risks

Honest accounting — this refactor is optional and non-trivial for a solo hobby project.

- **The work concentrates in the three hardest, most-interleaved files** (`src/index.js` 614 LOC, `AnchorAlarm.js` 797 LOC, `AppState.js`/`schema.js`) where base and anchor concerns run *through* methods. High one-time risk of silently regressing a working, in-production anchor alarm.
- **Verification is weak.** No live SignalK testing; the riskiest surface (Leaflet map, 500ms loop, `isAnchored()` panel-swap, optimistic anchor writes, initial `fitBounds`, delta routing) has essentially no automated coverage — only build/lint/`node:test`, and `node:test` covers backend anchor logic only. Mitigated by base unit tests + the both-apps CI build + boat-log iteration, but real regressions may only surface on a boat.
- **Indirection tax.** Replacing a readable single-file `AnchorAlarm.js`/`AppState.js` with base-class + override hooks means jumping between base and subclass to trace behavior — harder to debug for one maintainer, and slightly harder to debug on an MFD.
- **`bundledDependencies` fragility.** npm has historically been flaky packing symlinked workspace deps; the failure mode (base missing from the tarball → plugin won't load on a boat) is severe. Mitigated by the mandatory `npm pack --dry-run` gate + esbuild fallback, but it must never be skipped.
- **Unpublished base excludes external reuse.** A 4th party can't `npm i signalk-leaflet-base` to build their own plotter without switching to real publishing (accepting the lockstep cost).
- **Two apps will drift** unless CI builds both against base on every commit — more CI surface than one flat package.
- **Doubled branding/release surface.** Two `signalk{}` blocks, two manifests, two icon masters, two CHANGELOGs/publish flows to maintain.
- **`super-simple-plotter` barely exercises the seams.** It's essentially "base with anchor off," so it weakly validates the abstraction — risk of over-fitting hooks to exactly one non-trivial consumer.

**When NOT to do this.** If the plotter is genuinely a one-off you'd tweak rarely, a **feature-flag single package** (hide the anchor UI/backend behind a config flag, publish two thin webapp entry points from one repo) delivers "one copy of shared code" with far less ceremony and no framework. Choose the extraction only because zero-duplication was explicitly weighted over minimal ceremony, and because a genuinely distinct second published appstore package (own `signalk{}`, own branding, no anchor backend deltas) is wanted. If a third app never materializes, much of the abstraction was paid for two consumers.

---

## 12. Effort estimate

Moderate-to-large overall; a few focused weekends for a solo maintainer, back-loaded onto two files. Relative sizing per phase:

| Phase | Size | Risk | Notes |
|---|---|---|---|
| 0 Workspaceize | S | Low | Config/plumbing; assert identical tarball. |
| 1 Leaf modules → base | M | Low | ~15 files move with reworded comments + import rewrites. Mechanical. |
| 2 HUD/service seams | M | Low-Med | `HudPanel`, `ConfigPanel` engine, `StatusBar`, `FleetLayer` loosening, `BoatConfig` hook, move `scopes`/`watch-zones`. Clean seams. |
| 3 Backend harness | M | Med | `createPlugin` + `composeSchema` + base routes + OpenAPI; well-protected by existing `node:test`. |
| 4 `AppState` split | M | Med | Subscription-path + `calculate()` split; suppression machinery stays in `AnchorState`. Subtle but bounded. |
| **5 `PlotterApp` extraction** | **L** | **High** | The dominant cost + top bug risk. 797-LOC file, no live test, hook ordering. |
| 6 `super-simple-plotter` | S | Low | ~10-line subclass + ~15-line plugin + branding + publish pipeline. Nearly free — the payoff. |

**Biggest time sinks, in order:**
1. **Splitting `AnchorAlarm.js` (Phase 5)** into `PlotterApp` + `AnchorApp` and getting hook ordering right (`onInitialData` before `fitBounds`, `getHomeView` for both initial view and Home button, `buildPanels`/`buildControls` last, `onUpdate` last) — plus manual regression of Navico scroll-reverse, initial `fitBounds`, and the anchored info↔scope swap without live testing.
2. **Splitting `AppState.js` (Phase 4)** including the optimistic-write/suppression machinery — moderate but subtle.
3. **The config-schema unification (Phase 3)** touching backend schema, derived `UI_CONFIG_KEYS`, `ConfigPanel`, and both test files.
4. **Proving the packaging** — Vite bare-specifier resolution to base source, the base `exports` map, and validating the `bundledDependencies` tarball across a real `npm pack` (keep the esbuild-backend fallback ready). Budget ~half a session of fiddling here.

Phases 0–5 carry ~90% of the effort and risk and can all ship inside the workspace with the anchor app functionally unchanged. Phase 6 is comparatively free once the seams exist — that speed is both the payoff and the proof the extraction was correct.