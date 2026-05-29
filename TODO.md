# v2.3

- new plugin publish (screenshots, suggested, etc): https://github.com/SignalK/signalk-server/blob/master/docs/develop/plugins/publishing.md

- reset button on polygon controller overlay should use estimateAnchorPosition radius
- smaller font size on shape select

## UI - Config

- add local config editing dialog - if logged in
  - map overlay button + dialog
    - use bootstrap svg gear icon below
  - simple button that toggles config ui
  - ui should be a simple form for each item in ui-config
  - on change of any field, it should save to the backend
    - if logged in:
      * generate config json
      * POST to /ui-config
      * overwrite each parameter in plugin.config
      * save plugin config.

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed