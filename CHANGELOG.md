# v2.10.2

## Page-load performance

A round of startup work aimed at lightweight hardware — a Raspberry Pi running the single-threaded Signal K server — where the webapp's request fan-out at load contended with itself and bogged everything down:

- **The UI ships as a single inlined file** — the app's JS and CSS plus the five vendored Leaflet scripts and stylesheet are now minified and inlined into one `index.html` at build time, collapsing the asset fan-out into a single request. The app source map stays external so live debugging still works, but its 2.5 MB is only fetched when devtools is open
- **Live data no longer waits on the REST startup chain** — the websocket now opens in parallel with the ui-config → self → vessels sequence instead of after it, so position, heading, and wind deltas start flowing immediately (previously they stalled for seconds on a crowded anchorage, or indefinitely if the `/vessels` fetch timed out and the load looped). Since the snapshot can now arrive after deltas are flowing, it merges per path and a stale snapshot value can never overwrite fresher stream data
- **Heavy reads only happen when their feature is on** — the chart catalog fetch, the bulk fleet-tracks fetch, the History API probe, and the ~1 MB MapLibre stack for the Seascape overlay are each skipped unless the corresponding setting is enabled, and load lazily on first enable from the settings dialog. Own-track rehydration is now tracks-plugin-first, querying the History API only as a fallback. Side effect: the "Use Seascape Bathymetry" checkbox is now always visible since it gates the download, though enabling it remains a no-op on unsupported engines
- **The heavy reads that do run take turns** — the chart catalog, fleet tracks, and position history fetches now go through a queue one at a time instead of hammering the server simultaneously; each request's timeout only starts once it actually runs, so queue time never counts against its deadline
- **Common icons are preloaded** — the boat and control icons the map needs first are requested ahead of the rest of the page

## Bug fixes

- **TimeZero anchor positions now decode correctly away from the equator** — the Mercator conversion used the spherical Web Mercator approximation, but TimeZero encodes anchor geometry in true ellipsoidal WGS84 Mercator; the two diverge with latitude (about 20 km at 52°N), so a pulled anchor landed far from the boat and the watch-zone check rejected it. Both conversion directions now use the ellipsoidal projection, verified against a live capture at 51.85°N and locked in with round-trip and real-sample decode tests. Reported with a full diagnosis and captured evidence by seabits-steve
- **An anchor set in TimeZero now actually reaches Signal K** — the anchor change tick was read from the wrong discovery-beacon field (the constant schema version) and written into one TimeZero doesn't read, and nothing ever pulled from a peer, so sync was effectively one-way. The plugin now uses the correct beacon field, watches each peer's beacon, and pulls a newer anchor the way TimeZero peers do between themselves (take the sync lock, GET the anchor, release — with locks held over 30s treated as abandoned). The advertised tick also steps past the highest tick any peer has announced, so a local change is always strictly newer than TimeZero's account-wide counter, even across plugin restarts (#32, #34, thanks @dirkwa)
- **Tracks plugin errors no longer raise a status-bar warning** — a failed fleet-tracks fetch now just falls back to History API track rehydration silently

# v2.10.1

## Bug fixes

- **Own track loads on page reload even with past anchorages disabled** — restoring the current session's track from the History API lived inside the past-anchorages startup path, so turning off the Show Past Anchorages setting also stopped the live track from being rehydrated after a reload. The startup probe and track rehydration now always run; only the past-anchorages map control is gated on the setting

# v2.10.0

## TimeZero anchor watch sync

The anchor watch can now synchronise bidirectionally with TimeZero (TZ Professional / TZ iBoat) instances on the local network:

- **Sync over LAN** — dropping, reshaping, or raising the anchor in Signal K appears in TimeZero, and a TimeZero anchor change flows back into Signal K through the normal drop/raise paths. This speaks TimeZero's undocumented LAN sync protocol (a UDP 33000 discovery beacon plus an HTTP endpoint on TCP 32000), with the anchor circle serialised as TimeZero's 13-byte geometry blob, validated against live hardware and covered by unit tests with captured ground-truth samples. Opt-in via the new `enableTimeZeroSync` config option; since TimeZero's anchor watch is a circle, only circular watch zones sync. All sync I/O is best-effort and no-throw so it can never affect alarm operation (#30, thanks @dirkwa)
- **Pairing off NavNet by My TIMEZERO user ID (experimental)** — sync originally required a Furuno NavNet (172.31.x.x) address, which TimeZero trusts without an account. A new `timeZeroUserId` option advertises your My TIMEZERO user ID (a GUID from a signed-in account) in the discovery beacon, so Signal K pairs with TimeZero on an ordinary LAN too. Access control stays strict either way: the unauthenticated sync endpoint accepts only NavNet addresses or hosts that have been seen broadcasting your user ID — a GET discloses the boat position and a POST can move or raise the anchor, so arbitrary LAN hosts get 403. Stale or replayed peer updates can't overwrite newer local anchor state, and applying a peer's change is never echoed back to it (#31, thanks @dirkwa)

## New features

- **Show Past Anchorages setting** — a new toggle (default on) in the plugin config and settings dialog controls the past-anchorages feature. When disabled, the History API probe (and the session fetch / own-track rehydration that ride on it) is never sent. Toggling works live: enabling re-runs the probe and adds the map control, disabling removes it and clears any displayed track. The past-anchorages button also now picks up the dark-mode theme like the other map controls

## Bug fixes

- **No more server log spam when an AIS vessel ages out** — the webapp sent a per-vessel unsubscribe frame that Signal K rejects (it only accepts the global form), logging an error each time. It now just drops the vessel from its resubscribe set; a silent vessel emits no deltas, and the server forgets the subscription when the socket closes
- **No more warning when the tracks plugin isn't installed** — probing for @signalk/tracks-plugin no longer logs a warning on servers that don't have it

## Documentation

- **signalk-questdb is now the recommended history provider** — the recommended-plugins list swaps @signalk/tracks-plugin for signalk-questdb, and the README notes that tracks-plugin support will be dropped in a future release in favor of a history provider

# v2.9.0

## Anchorage session log & past anchorages

The plugin now keeps a history of where you've anchored:

- **Every anchoring session is logged** — drop and raise timestamps, anchor position, and the watch zone are written to the plugin data dir and exposed via `GET /sessions` and `DELETE /sessions/:id`. Logging is no-throw and writes atomically, so bookkeeping can never block a drop or raise, and a reconcile step at plugin start heals sessions whose drop/raise events were lost to a crash (reconstructed timestamps are flagged as estimated)
- **Past Anchorages dialog** — when the server has a v2 History API provider (e.g. signalk-questdb), a new dialog in the webapp lists past sessions and reconstructs any session's vessel track from recorded position history, drawing it on the map
- **Tracks survive a server restart** — the same history mechanism rehydrates the live scribble track when the app loads mid-anchorage after a restart, which the in-memory track alone cannot survive. Without a history provider everything behaves as before

## New features

- **GPS glitch filter** — a new "GPS Glitch Filter Speed" setting (in the plugin config and the settings dialog, shown in your preferred speed unit; 0 = off, the default) rejects any fix whose implied speed from the last good fix exceeds the limit, conceding the movement is real after 5 consecutive rejections. On the plugin side, glitched fixes never reach the drag check, so a GPS jump can't trip the alarm — instead you get a warn-severity notification (never over an active drag alarm) that clears on the next good fix. In the webapp, a spike can't move your boat marker or pollute the track, other vessels get per-MMSI filters, and rejections show a status-bar error naming the vessel
- **Drop the anchor with no position** — `POST /dropAnchor` with no body now drops at the vessel's current fix with the default watch zone, and a `"here"` string PUT to `navigation.anchor.position` does the same while reusing the last-configured zone. This lets a caller that can't compose a lat/lon — e.g. a hardware helm button PUTting a fixed value — still drop the anchor; both fail cleanly with no GPS fix (#29, thanks @dirkwa)
- **Track visibility toggles** — new "Show My Boat Track" and "Show Other Boat Tracks" settings (both default on) hide vessel tracks on the map without losing them: hidden tracks keep accumulating points and redraw intact when re-enabled

## Reliability & UX

- **Layers no longer vanish at the 180° antimeridian** — panning across 180° (with worldCopyJump) stranded vector layers and markers in the old world copy, so tracks streaked across the map and boat markers, watch zones, the anchor rode, and popups vanished off the far side. Every layer type now wraps to the world copy nearest the map center and re-projects on pan, so anchoring near the dateline just works
- **Smarter boat name labels** — labels were hidden wholesale below zoom 16 to avoid clutter, which also hid useful names when vessels were sparse. Per-label collision detection now runs at any zoom, greedily hiding only labels that would overlap a higher-priority (closer) one, with ties broken by MMSI so labels don't flicker; hidden labels reclaim their spot as soon as the crowding clears
- **Two-column settings dialog on wide displays** — above a 640px breakpoint the dialog widens to 600px with checkbox toggles on the left and the other settings on the right; narrow screens and MFDs keep the single-column layout
- **Leaner page load** — startup consolidates into `GET /ui-config` (which now also serves the self id and plugin version) plus a single bulk `/vessels` fetch that seeds both own-boat state and the fleet cache, instead of four overlapping requests that transferred the own-vessel tree twice. The first websocket connect subscribes immediately against that seed, and the first position calculation already runs with the configured scopes and glitch limit

## Documentation

- **The HTTP API and Signal K data model are now documented** — new [docs/API.md](docs/API.md) covers the drop/set-zone/raise endpoints, ui-config, the boat icon API, the published `navigation.anchor.*` deltas, and the `notifications.navigation.anchor` alarm, linked from the README. The drop/set-zone docs and openApi.json now also cover polygon watch zones (`{bearing, distance}` vertices, 3–24 of them), which the endpoints always accepted but never documented

# v2.8.0

## Control toolbar redesign

The anchor controls at the top of the map got a full layout overhaul:

- **A single horizontal row** — the shape picker, radius panel, and raise/drop button now sit side by side in one 80px-tall row instead of stacking vertically, reclaiming map space. Raise/Drop is a 80×80 square with a new anchor icon (replacing the ⚓ emoji) above an all-caps label, and the radius panel is an all-in-one box with the value on top (tap to type) and −/+ steppers below
- **Shape picker matches the other buttons** — it now shows a glyph over a "SHAPE" label, and is a custom dropdown that renders an SVG glyph per shape (circle / sector wedge / polygon) rather than plain text
- **Reworked polygon controls** — the polygon reset button is replaced by a tap-to-type radius input, mirroring the circle/sector panel, with the sides selector below it reading "{n} sides". The radius input scales the polygon about the anchor while preserving any freehand vertex edits, polygon size now carries over when you switch between shapes, and the default drops to 6 sides to match the backend

## New features

- **Embed just the map** — two new URL query params trim the webapp for dropping into another app or dashboard: `embedded=true` hides the tide / wind / scope / info panels and the settings gear (the map, watch zone, boat/fleet, and status bar still update live), and `showAnchorControls=true/false` toggles the top anchor toolbar. They're independent, so a bare live map is `embedded=true&showAnchorControls=false`
- **Log in and out from the settings gear** — the gear is now always on the map: tap it while logged out to open the login modal directly, and a new "Log out" link sits in the settings dialog footer above the version link
- **Quieter notifications** — a new "Enable notifications for 'normal' state" plugin option (default on) lets you silence the informational Off / Watching / Started anchor notifications while anchored, since the state already implies the alarm is watching; drag alarms are unaffected (fixes #24)
- **New anchor data paths** — the plugin now publishes `navigation.anchor.distanceFromBow`, `.bearingTrue`, and `.apparentBearing`, computed from the live fix, heading, and GPS→bow offsets, with units metadata

## Reliability & UX

- **Other vessels fill in their name, type, and size reliably** — fleet static data (name, ship type, dimensions, antenna offsets) now streams in over a dedicated per-vessel websocket subscription for each sighted target, backed by a few follow-up REST fetches in the first minutes. This replaces the old single fetch that often landed before the AIS static report existed on the server; vessel names in particular now populate where they previously never did
- **Anchor paths survive a mid-watch reconnect** — the set-once anchor paths (position, state, watch zone, max radius) are now re-broadcast every 5 minutes while watching, so a consumer like signalk-autostate that starts mid-watch still receives them (closes #23)
- **Correct zoom direction on Navico MFDs** — scroll/rotary zoom was inverted on B&G / Navico consoles because they report wheel deltas with the opposite sign; the MFD browser is now detected and the zoom direction corrected, leaving desktop browsers untouched
- **24-hour clock in the tides panel** — tide times now show as zero-padded 24h (20:40, not 8:40pm), which is less ambiguous worldwide and narrower where panel space is tight (fixes #25)

## Bug fixes

- **Plugin loads again on Node < 20.19** — the CJS entry shim threw `ERR_REQUIRE_ESM` on older Node (e.g. 20.18.1) and also broke signalk-server's import() fallback, so the plugin failed to load entirely. The shim is gone, `main` points straight at the ESM entry, and the engine floor relaxes back to Node 20.0.0 (fixes #22)

## Under the hood

- The bow-offset translation and distance/bearing math are extracted into a shared `shared/geo.js` `Geo` class, so the map overlay (`GeoMath`, `AnchorOverlay`) and the newly-published anchor deltas share one implementation instead of duplicating it

# v2.7.0

## Charts & base maps

The map is no longer just OSM or satellite — you can now stack your own charts and depth data on top:

- **Local charts** — charts served by chart providers now appear as toggleable overlays in the layer control, drawing on top of the base map within their bounds while the base still fills the rest of the map. They show automatically by view and zoom and are on by default; the new **"Use Chart Layers if Available"** setting keeps them in the layer control but off until you toggle them, if you prefer. No WebGL needed, so they work on the older Chromium 69 MFDs too (fixes #21)
- **Seascape bathymetry** — an optional water-depth chart overlay from openwaters.io, toggleable in the layer control (off by default). Needs an internet connection and a WebGL-capable browser; where either is missing the base map shows unchanged, and on MFDs that can't render it the toggle is hidden rather than left dead
- **"Blank" base map** — a no-tiles base for offline use, slow/metered links, or when you're relying only on your own local charts. Base maps now order **Blank → OpenStreetMap → Satellite** everywhere

## New features

- **Custom boat icon** — upload your own custom icon (PNG / JPG / GIF / WebP, up to 500 KB) straight from the settings dialog, with a live preview plus replace and delete. The image is stored on the server and its type is verified from the file's own bytes, not the browser's claim
- **Boat name label toggle** — a new "Show Boat Name Labels" setting turns other vessels' on-map name labels on or off (default on) (fixes #20)

## Reliability & UX

- **Every setting now applies live** — the watch-zone shape and fleet filter radius used to need a page reload; they now take effect immediately, and the "\* applies after reloading" note is gone
- **Fleet updates from live WebSocket deltas** — other vessels now update straight from the SignalK delta stream instead of being polled, so positions and headings refresh with lower latency
- **Right icon once AIS static data lands** — a vessel first drawn from an early position delta (before its type/dimensions arrive) no longer stays stuck as the default sailboat; its icon and hull now update in place when the real AIS static data comes in
- **Bigger default fleet radius** — the fleet filter radius now defaults to 100 km (was 500 m), so nearby vessels show up out of the box
- **Version link in the settings footer** — the plugin version moved to the bottom-left of the settings dialog as a link to the npm package page

## Breaking / removed

- **REST polling removed** — WebSocket is now the only SignalK transport, and the `connectionType` config option is gone. This is a lower-latency, less chatty connection that had already been the default since v2.1

## Under the hood

- New `ChartLayers` module (catalog fetch → per-chart Leaflet tile layers) and `SeascapeLoader` module; local charts draw in a dedicated `chartPane` so they always stack above the base map and Seascape regardless of base-map switches
- MapLibre GL and its Leaflet binding are vendored under `ui/public/maplibre/` and injected at runtime only on WebGL-capable engines, keeping the ~1 MB renderer entirely off the Chromium 69 path
- New `GET` / `POST` / `DELETE /icon` HTTP routes back the custom boat icon, with magic-byte type sniffing, a 500 KB cap, and streaming body-size enforcement; documented in `openApi.json`
- App icons are now committed to the repo and icon generation was dropped from the build

# v2.6.1

## Bug fixes

- **Fewer oversized ships on the map** — recreational Class B AIS transponders sometimes broadcast garbage length/beam; when a Class B target reports a length above the 24m Class A threshold, its dimensions now fall back to defaults instead of drawing a giant ship marker (fixes #18)
- **Map wraps cleanly across the date line** — panning over the antimeridian (180° longitude) now scrolls smoothly, and markers jump to the correct side instead of stranding on the far edge

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

- **In-map settings dialog** — logged-in users can now edit UI settings without leaving for the plugin config page. A gear button on the map opens a modal form (panel toggles, basemap, default shape, fleet radius, connection type); each change saves immediately to the backend and re-renders, so panel show/hide takes effect live. Settings that can't apply on the fly are flagged "\* applies after reloading."
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
