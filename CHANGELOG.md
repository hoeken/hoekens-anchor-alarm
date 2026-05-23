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
