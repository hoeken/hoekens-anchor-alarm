# v2.2

## UI - CircleZoneOverlay

- add a draggable dot handle on the circle to modify the radius.
  - Add an _onZoneEditStart and _onZoneEditChange callbacks that also thread through and have those wired up from the top level to set/clear our AppState.watchZone suppression timestamp.
  - Internally update our zone with the new radius to redraw
  - when finished dragging, call _onChange with our zone to update the backend
  - Radius is in meters and should be rounded to a whole number.

## UI - SectorZone

- similar design to circle zone:
  - type: sector
  - circle centered on anchor position
  - radius
  - start and end angles that define the safe zone
  - draggable dot handle for radius - should be between start/end handles
  - draggable dot handle for start / end zones - also on radius of circle

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

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed