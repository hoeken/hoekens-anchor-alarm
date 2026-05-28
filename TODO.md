# v2.3

- new plugin publish (screenshots, etc): https://github.com/SignalK/signalk-server/blob/master/docs/develop/plugins/publishing.md

## UI - Config

- add default shape: circle, sector, polygon
- add enable_tide_box
- add enable_wind_box
- add enable_scope_box
- info box automatically shows
- scope selector: 7, 5, 4, 3 (comma separated?  multiple select?)

- loading
  - default ui config is stored as AnchorAlarm.config
  - attempt to load from cookies or other local storage
  - if not found, load from server and save to cookies / local storage
  - new values should overlay the default config object so that if we add options, users from older versions of the plugin will get those defaults loaded.
- add local config editing dialog
  - map overlay button + dialog
  - simple button that toggles config ui
  - generate config json, save to AnchorAlarm.config
  - save to cookies / local storage
  - save to app or nah?

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed