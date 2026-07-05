# v2.6.0

## Light & dark mode

The HUD now has a full light and dark theme, and it picks the right one on its own:

- **Automatic on MFDs** — B&G / Navico displays that pass a `?mode=night|day` query param get that theme; otherwise the HUD follows your device's OS light/dark setting, defaulting to dark
- **Toggle button** — a sun/moon button in the top-left corner flips the theme at any time (not saved, so each load re-derives it from your MFD or OS)
- **No flash on load** — the theme is chosen before the first paint, so you never see a light flash before dark (or vice-versa)
- Dark mode also restyles Leaflet's own controls, popups, and dropdowns, and tones stark whites down to a softer grey for better night legibility

## New features

- **Configurable scope ratios** — a new "Scope Ratios" setting lets you choose which scope multiples the scope calculator shows (e.g. `7,5,4,3`), editable from the plugin config or live in the web UI. Leave it blank to turn the scope rows off entirely; invalid entries are ignored

## Reliability & UX

- Scope panel layout and styling refined
- Control toolbar button borders, backgrounds, and top spacing now match Leaflet's own controls more closely

## Bug fixes

- Drag-selecting text inside a dialog field and releasing over the dimmed backdrop no longer closes the dialog — it only dismisses on a genuine click that both starts and ends on the backdrop

# v2.5.1

## New features

- **Test your alarm from the helm** — a new "Allow setting anchor watch zone outside of vessel position" option (off by default) lets you drop the anchor or set a watch zone even when the boat is currently outside it, so you can deliberately trip the alarm to check that it works
- **"Remember me?" on login** — the in-app login form now has a "Remember me?" checkbox (on by default) that keeps you signed in with a long-lived session instead of logging you back out shortly after

## Bug fixes

- **One clear answer on drop / zone changes** — the map UI no longer second-guesses whether the boat is inside the watch zone when you drop the anchor or change the zone; the backend is now the single source of truth and its messages are shown directly, so you get one consistent, correct result (fixes #17)

## Under the hood

- Slightly darker app icon

# v2.5.0

## Now works on Navico chartplotters

The HUD now runs on Navico MFDs (via the SignalK Navico embedder). Everything that was broken on those older displays now works:

- **Drop and raise the anchor again** — both buttons were dead on Navico displays; they now work
- **Vessel tracks show up again** — track history now renders correctly
- **No more frozen screens** — the raise confirmation, set-radius, settings, and login prompts used to lock up the display; they're now smooth in-app dialogs, and you log in right inside the app
- **Looks right again** — fixed fonts, spacing, layout, and labels that displayed incorrectly

## New features

- **Add it to your home screen** — install the HUD like an app and launch it full-screen, with a proper icon, instead of opening a browser tab
- **Crisper icons everywhere** — app, browser, and home-screen icons are all sharper and consistent
- Added `signalk-navico-embedder` to the recommended plugins

## Bug fixes

- **No more blank boats** — when a vessel's icon failed to load it showed up empty; it now falls back to a default boat icon (fixes #16)
- **Boats sit correctly on the map** — a bad GPS offset could skew your boat icon and anchor circle off-center; boat shape and position are now kept sensible even with bad data
- **Boat name labels centered** — names now sit centered above the boat at any heading, instead of floating off to one side

# v2.4.2

## Bug fixes

- Fixed a typo that caused the wrong minimum depth calculation
- `loa` / `beam` / `totalAnchorChainLength` now fall back to sensible defaults when configured as zero

# v2.4.1

## Bug fixes

- Corrected the recommended plugin package name to `@meri-imperiumi/signalk-autostate`
- Fixed a broken icon link in the README

# v2.4.0

## New features

- **Boat name labels** — when zoomed in, fleet vessels now show their name on a white drop-shadow background above the icon for contrast against the map; the label is clickable and opens the vessel info box just like the marker
- **VesselFinder link** — the vessel info popup now includes a link to look the boat up on VesselFinder
- **Track highlight on hover** — hovering or selecting a vessel now highlights its track history and dims the other tracks
- GPS antenna marker is now a small cross instead of the large antenna icon, so it's less obtrusive

## Under the hood

- Replaced the `@signalk/client` dependency with a native `WebSocket` wrapper (`SignalKStream`), dropping a heavy dependency
- Greatly expanded test coverage — unit tests for `shared/watch-zones` alarm geometry plus full lifecycle and critical-path tests for the HTTP routes, plugin index, SignalK bus, and watchdog; tests now run as a pre-commit and pre-publish requirement
- New GitHub Action–based release/publish workflow
- Replaced the `postinstall` husky eval with a `prepare` script; `npm audit fix`
- Added `signalk-tracks-plugin` to recommended plugins
- README, screenshots, and docs cleanup; screenshots moved to `docs/screenshots/` and refreshed

# v2.3.1

## New features

- **Richer fleet vessel popups** — clicking an AIS vessel now opens a detailed info box showing name and MMSI in the title plus a two-column table of length, beam, distance, bearing, SOG, and COG (previously just "<name> at <N> meters")
- Vessel SOG and COG are now read from Signal K (`navigation.speedOverGround` / `navigation.courseOverGroundTrue`) and rendered with proper unit conversion and formatting

## Reliability & UX

- Vessel info boxes now update each field in place on every poll instead of rebuilding the whole popup body, so open popups refresh without flicker
- The GPS antenna markers (own boat and fleet) no longer intercept clicks, so clicks reach the vessel markers underneath
- Angle values now render without a space before the degree symbol (e.g. `120°` instead of `120 °`)
- Bearing columns and other numeric fields in the vessel info table are right-aligned
- Cleaned up debug logging

# v2.3

## New features

- **In-map settings dialog** — logged-in users can now edit UI settings without leaving for the plugin config page. A gear button on the map opens a modal form (panel toggles, basemap, default shape, fleet radius, connection type); each change saves immediately to the backend and re-renders, so panel show/hide takes effect live. Settings that can't apply on the fly are flagged "* applies after reloading."
- **Tide panel** — a new compact HUD panel showing the current tide state plus the next two tides when anchored (split out from the info panel)
- **Panel visibility config** — new `enableTidePanel` / `enableWindPanel` / `enableScopePanel` flags let you show or hide individual HUD panels; show/hide is centralized in `updateMap()`
- **Default zone shape** — new plugin/UI config option to choose which watch-zone shape (circle / sector / polygon) new anchors start with
- **Login button** — the control toolbar now shows a login button, and editing controls only appear once you're logged in
- **Outside-zone guard** — dropping the anchor or setting a zone is now blocked when the boat is currently outside the proposed zone, with a clear error
- Plugin version is now shown at the bottom of the settings dialog
- Basemap changes from the UI config now apply dynamically without a reload

## Reliability & UX

- Reworked config loading so HUD panels no longer flash on/off as enabled/disabled settings resolve
- Rearranged the UI for a more symmetrical, logical layout; map attribution now clears all four corners so the full edge is usable
- Wind and tide panels now always show
- StatusBar gained `logError()` for surfacing temporary, self-clearing errors
- Zone handle icons are a bit bigger now so they're easier to grab
- Anchor controller error-log timeout and wording tweaked
- "Water Depth" relabeled to "Surface Depth" in the scope panel
- Button borders and backgrounds tweaked to match the rest of Leaflet's controls

## Bug fixes

- Fixed the radius resetting when switching to a polygon (or other zone without a radius) and improved default-radius handling on polygon reset
- Fixed a z-stacking bug with the config panel

## Under the hood

- New `POST /ui-config` endpoint validates/coerces submitted settings against the plugin schema, then writes and persists them
- `schema.js` is now the single source of truth for UI config: it owns the `UI_CONFIG_KEYS` whitelist plus `pickUiConfig()` / `coerceUiConfig()` helpers, and `http-routes.js` GET/POST are thin wrappers over them
- `ConfigPanel` rebuilt from imperative DOM construction to `innerHTML` template markup, with inputs wired by `data-config-key`
- `SignalKHelper.saveConfig()` POSTs UI config changes to the backend
- `openApi.json`: completed the Config schema (all fields, fixed a stale POLLING enum) and documented `POST /ui-config`
- Renamed `enable*Box` config keys to `enable*Panel`
- Added screenshots, recommended plugins, and categories to `package.json` for the SignalK app store

# v2.2

## New features

- **Watch zone shapes** — the anchor alarm is no longer just a circle. Switch between three shapes via the new toolbar dropdown:
  - **Circle** — now resizable by dragging a handle on the rim
  - **Sector** — radius plus a draggable start/end arc, defaults to a 120° arc opposite the boat's heading so the safe swing arc lies astern
  - **Polygon** — free-form, N-sided shape with draggable vertices. Drag an edge midpoint to insert a new vertex (capped at 24), drag a vertex onto its neighbor to combine them (aka delete). Self-intersection is prevented automatically.
- All zones are stored anchor-relative as `{bearing, distance}`, so the shape translates naturally with the anchor
- **`totalAnchorChainLength`** plugin config (default 100m) — caps anchor-position estimates at available chain length and highlights ScopePanel rows in red when required rode exceeds it
- **Tide direction arrow** added to the tide HUD entry so you can see at a glance whether the tide is rising or falling
- **Info panel** now shows a one-word anchor status; the longer message moves to the StatusBar so the panel stays compact
- **Non-essential alarms** (engine-on, etc.) are now visual-only — no more audio nuisance for things that don't warrant it
- Plugin version is now loaded and available to the client

## Reliability & UX

- **AppState is now the single source of truth.** AnchorController's parallel state machine (UP/DROPPING/ANCHORED/RAISING) and reconcile loop are gone. Drop/raise/set-radius writes optimistically against AppState, fire onChange, and roll back on POST failure. The UI no longer fights itself between local intent and delta updates.
- Brief client-side suppression window after a write keeps stale server deltas from flipping the UI back before the round-trip completes
- Info / scope panels each handle their own show/hide based on `state.isAnchored()` instead of being driven by the controller
- Info panel and scope panel handle missing values more gracefully
- Polygon vertex edge-midpoint ghost handles reposition every drag frame instead of lagging behind

## Bug fixes

- Fixed regression where the engine-off alarm disable / anchor-raise flow stopped working
- Fixed wind panel not hiding properly
- Fixed `maxRadius` units disappearing from the UI
- Fixed a constructor bug from the CommonJS → ESM transition
- Fixed missing show/hide functions on some HUD elements (fixes #14)
- Fixed a ghost-vertex drag bug in the polygon overlay
- Icons preload again so they show up faster

## Breaking / removed

- **`configuration.radius` → `configuration.zone`** — the plugin now persists a single zone config string covering shape + geometry. A one-shot migration on first start converts existing radius values to a circle zone, so no manual action is required. `navigation.anchor.maxRadius` is still published for circle zones so Freeboard and other consumers should keep working.
- `maxRadius` removed from `AppState` and the client codebase; the radius envelope is now derived from the active zone

## Under the hood

- New `shared/` module imported by both the Node plugin and the Vite-bundled UI:
  - `WatchZone` / `CircleZone` shape abstraction
  - shared haversine (deduplicated from `src/utils.js` and `ui/js/GeoMath.js`)
- **`@turf/turf`** adopted for all distance / bearing / point-in-polygon math, replacing the home-grown `shared/geo/distance.js`
- Plugin migrated from **CommonJS to ESM**. `src/index.cjs` is a tiny shim so signalk-server's `require()`-based plugin loader still works on Node 20.19+ `require(esm)`
- Server-side `src/` was re-consolidated back into `index.js` (the v2.1 split into `anchor-service` / `position-monitor` / `anchor-state` proved to be over-modularization for the scope of this plugin)
- New `POST /setZone` endpoint; `/setRadius` retained as a circle-only shim
- New `navigation.anchor.watchZone` SignalK path publishes the full zone config
- Client-side zone architecture:
  - Pluggable zone overlay classes (`CircleZoneOverlay`, `SectorZoneOverlay`, `PolygonZoneOverlay`) and matching `*ZoneControls` toolbars
  - `ZoneHandle` reusable drag handle that reflects the app's r/g/b color styles
  - `onZoneChange` callback wired through overlays for live editing
  - Default-config dispatch lives in the zones registry, not in `ControlToolbar`
- `DisplayUnit` class overhauled for cleaner unit handling
- `GeoMath.calculateBearing` delegates to a shared `bearing()` helper
- Build/generated files removed from `/public` (no longer tracked in git)
- CI now runs on all branches

# v2.1.1

## New features

- **Configurable default basemap** — new `defaultBasemap` plugin option ("OpenStreetMap" or "Satellite", default "Satellite") exposed via `/ui-config`, so installs on slow or metered connections can default to OSM without editing the built client (thanks @Peter-Petrik, #13)

## Bug fixes

- Fixed WindPanel calling a non-existent `_hide()` method; added proper `show()` / `hide()` methods so the panel actually hides when wind data isn't available (fixes #14)

# v2.1

## New features

- **WebSocket** is now the default SignalK connection mode (POLLING still available) — lower latency, less HTTP chatter
- **Tides** added to the HUD info panel
- **Anchor icon** now rotates with the chain so it visibly points the right way
- **Display units** now pulled from SignalK's user preferences (`/signalk/v1/unitpreferences/active`) via a new `DisplayUnit` class that handles conversion and formatting
- **OpenAPI** definitions added for the plugin's HTTP endpoints
- New plugin config options exposed in the schema:
  - `filterRadius` — distance for AIS target filtering (integer, meters, default 500)
  - `connectionType` — `POLLING` or `WEBSOCKET` (default `WEBSOCKET`)
- New `/ui-config` HTTP endpoint so the client can read those settings
- Post-login redirect for unauthenticated users back to plugin

## Reliability & UX

- HUD info / scope panels now hide entirely when their data isn't available, instead of rendering with dashes
- Stale-data check only flags values that are actually present — missing data no longer registers as stale
- Status bar can now set and clear statuses instead of being one-shot, so transient errors clear themselves once resolved
- Raise/drop over WebSocket is more responsive and no longer races with the SignalK ack
- Changing the anchor radius updates the UI immediately rather than waiting for the round-trip
- Track points are simplified before rendering so long histories stay fast
- Non-logged-in users can view the app again (read-only)
- More freshness and missing-data checks throughout the UI

## Bug fixes

- Fixed race conditions between raise/drop and the SignalK ack
- Fixed missing MMSI parameter handling for other vessels
- Fixed other-vessel heading not updating
- Cleaned up preload error message and a stray debug-logging typo

## Under the hood

- Client JS now bundled with **Vite**
- Server-side `index.js` moved into `src/` and split into focused modules:
  - `anchor-service` — anchor domain operations (drop / raise / set-radius)
  - watchdog and utility helpers separated out
  - `updateAnchorAlarm` / `updateAnchorStatus` reworked with new internals
- Client-side refactor continued: introduced an `AppState` object, finished extracting `FleetLayer` from `AnchorAlarm`, moved all HUD panels and overlays into `ui/js/hud/`, one file per class
- Renamed `SignalkClient` → `SignalkHelper`
- `mathjs` adopted for unit conversion
- Added a SignalK plugin CI workflow
- Switched JS formatting from Prettier to ESLint (Prettier still used for non-JS)

# v2.0

## New features

- **Wind Barb** drawn on the map to give you a quick visual of wind speed and direction
- **Home button** that recenters the map on the boat — and re-estimates the anchor position when pressed while the anchor is raised
- **Minimum depth indicator** with simple color coding so you can see at a glance whether you have enough water under the keel at low tide
- **Status bar** added to the HUD that surfaces the current anchor state plus any errors or stale-data warnings

## Reliability & UX

- Failed SignalK writes (drop/raise/set-radius) now surface an error to the user and roll the anchor state back instead of silently desyncing
- SignalK connection errors and stale data are now visible in the status bar instead of failing quietly
- Stale-data checks added throughout the UI so values that haven't updated recently are clearly flagged
- Page auto-refreshes after being hidden for a long time (e.g. phone in pocket overnight) so you come back to fresh data
- Improved tidal height extrapolation, giving more accurate scope suggestions when low+high tide are in the past or future.
- Pinch-zoom on phones now only zooms the map — UI elements no longer scale
- Plugin reports a clear error in the SignalK server log when `signalk-tracks-plugin` is not installed
- Validity check on lat/lng before any drawing happens, avoiding occasional crashes on bad data

## Bug fixes

- Fixed buttons on iOS that weren't tappable in some layouts
- Canceling the "set radius" dialog no longer erases the current radius
- Fixed an anchor chain offset bug that misplaced the anchor relative to the bow
- Fixed the raise-anchor button getting stuck after a drop
- Several small bugs caught during the refactor: marker leaks, sentinel-value confusion, dead code paths

## Breaking / removed

- Dropped reliance on `environment.depth.transducerToKeel` (fixes #6) — depth-below-keel now comes from SignalK directly
- Removed jQuery dependency

## Under the hood

- Client JS rewritten as ES modules organized into focused classes:
  - `AnchorAlarm` — top-level orchestration
  - `AnchorController` — drop/raise/set-radius commands and rollback
  - `AnchorOverlay` — anchor marker, circle, and rode line on the map
  - `ControlToolbar` — buttons and confirmation dialogs
  - `FleetLayer` — own vessel + AIS targets, paths, and icons
  - `HudPanels` / `StatusBar` — info panels and status display
  - `SignalKClient` — single consolidated `vessels/self` poll instead of per-leaf requests
  - `BoatConfig` — boat geometry value object
  - `GeoMath` — bearing/distance math extracted from the main file
  - `WindBarb` / `StaleReloader` — visualization and visibility-refresh helpers
- Replaced the `isAnchored` / `waitingForTheDrop` boolean tangle with an explicit `AnchorState` machine
- Replaced the ship-type `switch` with a lookup table
- Added Prettier and ESLint with a pre-commit hook

# v1.3.3

- Startup notification visual only now. Fixes #11

# v1.3

- added a table to bottom right with various scope suggestions based on depth + bow height above water + tidal delta
- plugin is now gps antenna location aware. this makes calculation of the anchor bearing and distance more accurate
- added depth below surface to the info block
- fixed a bug when loading app and circle isnt over estimated anchor target
- radius guess is now a multiple of 5
- added required path checks to the plugin config page
- added new icons based on ais type of the boat

# v1.2

- removed openseamaps layer
- updated UI positions for one hand use on mobile
- fixed zoom issues with satellite imagery
- now defaults to satellite imagery layers

# v1.1.2

- fixed bug where position watchdog triggers when anchor alarm turned off
- fixed an error with other vessels historical tracks
- other vessels headings now parsed from AIS
- fix to properly display new track points loaded while page is open

# v1.1

- cleaned up global variables
- also show other vessels and their path history within filterRadius.
- prepopulate anchor position with a guess based on heading, depth, and gps offset
- re-send dragging alarm every X minutes w/ new distance
- add status text with current alarm status
- implement a no position watchdog alarm
- increased the max zoom
- change to draggable anchor
- preload icons
- race condition ui bugfix
- zoom to fit the anchor circle now
- fixed login on set radius

# v1.0

- update leaflet and jquery
- display high resolution history with paths plugin.
- add hotline to differentiate old vs new path: https://github.com/iosphere/Leaflet.hotline
- add line and distance to anchor to UI.
- added bearing to anchor to UI.
- added wind speed / angle
- boat going back inside radius should clear alarm
- anchor alarm should include distance in message.
- add check to propulsion.\* before calling calling alarm.
- update plugin status when anchored, idle, or dragging.
- raise anchor on initial page load has a small bug with anchor location.
- load wind / depth data on first call
- web client tracks signalk state properly
- remove / cleanup extra stuff in the module
  - rodeLength
  - manual setting
  - warning levels - should be a binary trigger
  - config settings
  - altitude in dropAnchor calls
