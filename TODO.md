# v2.2

## UI - PolygonZone

- delete vertex?

## UI - Misc

- convert all the functions in ui/js/geomath.js to turf?
- convert all the functions in shared/geo/distance.js to turf?
- replace all calls with direct calls to turf.  no wrappers

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