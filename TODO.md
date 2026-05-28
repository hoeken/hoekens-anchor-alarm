# v2.3

- new plugin publish (screenshots, etc): https://github.com/SignalK/signalk-server/blob/master/docs/develop/plugins/publishing.md

## UI - Boxes

- add tide_box_enable to schema / backend / ui-config
- add wind_box_enable to schema / backend / ui-config
- add scope_box_enable to schema / backend / ui-config
- move the show/hide box logic into the updateMap() function
  - if enabled
  - tide / wind / info show when anchored
  - scope shows when anchor up
  - each box handles its own show/hide internally if required data is available
  - we will have access to the app config there + appState
- box updates just deal with their own internal states

## UI - Config

- add default shape: circle, sector, polygon
- add enable_tide_box
- add enable_wind_box
- add enable_scope_box
- info box automatically shows
- scope selector: 7, 5, 4, 3 (comma separated?  multiple select?)

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