# v2.2

## UI - PolygonZone

- New `PolygonZone` watch zone type
  - config: `{ type: "polygon", vertices: [{lat,lng}, ...] }` — absolute lat/lng, min 3 max 24
  - use turf.js for `booleanPointInPolygon`, `kinks`, `bbox`
  - `getCircleRadius()` returns farthest vertex distance (legacy SignalK consumers)
- Polygon translates with anchor: anchor drag shifts every vertex by Δlat/Δlng
- Vertex handles
  - one `ZoneHandle` per vertex; drag updates that vertex
  - clamp during drag so polygon never self-intersects (mirror SectorZone._clampAngle)
  - reject any commit whose `kinks()` is non-empty as a backstop
- Ghost handles at edge midpoints
  - on dragStart, insert a new vertex between the two neighbors and continue drag on it
  - hidden when vertices.length === 24
- No vertex delete gesture yet — revisit if needed
- `PolygonZoneControls` toolbar
  - sides dropdown (3..12, default 8) — local UI state, not in zone config
  - reset button — rebuilds regular N-gon centered on anchor at a local default radius (60m for now; later from estimateAnchorPosition / mode switch)
  - no radius stepper

## UI - Misc

- ControlToolbar._defaultZoneConfig(type) -> call a static method on the appropriate zone and pass in appState

- add totalChainLength to prefs -> design.totalChainLength
- add color coding to scope table if length > totalChainLength
- add bounds to estimatedAnchorPosition
  - max distance <= totalChainLength
  - circle radius = distance from bow + loa * 2

# LONG TERM

## UI - Tide Box

- split the tide info out from the infobox
- show a small graphical tide representation
- on click -> tides plugin webapp
- make display configurable in the UI.

## UI - Config

- loading
  - ui config is already stored as AnchorAlarm.config
  - attempt to load from cookies or other local storage
  - if not, load from server
  - if not, fall back to defaults in AnchorAlarm.config
- add local config editing
  - map overlay button + dialog
  - simple button that toggles edit ui
  - generate config json, save to AnchorAlarm.config
  - save to cookies / local storage
  - save to app or nah?

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed