# v2.2

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

## UI - Tide Box

- split the tide info out from the infobox
- show a small graphical tide representation
- on click -> tides plugin webapp
- make display configurable in the UI.

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed