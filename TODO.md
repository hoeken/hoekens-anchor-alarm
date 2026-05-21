# v2.2

## Watch Zones

- refactor out anchor watch zone shapes
  - circle
  - polygon
  - sector
  - ???
- when anchor up, UI shows a zone shape dropdown
- each zone shape class controls:
  - drawing zone on the map
  - zone edit ui
  - detecting inside/outside condition
  - passing zone configuration to AnchorController
- we also need a way to use the same class in the UI and in backend to avoid duplication of code

## UI Config

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