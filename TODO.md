# v2.2

## Watch Zones

- refactor 1: simplify and homogenize anchor controller / overlay code
  - remove the the AnchorController.reconcile() code
  - we should always default to the state from the server (appState)
  - when local changes are made, update our local appState config
  - ignore anchor config updates from the server for POST_ACTION_SETTLE_MS seconds
    - this should be moved to AppState
    - anchor.position
    - anchor.maxRadius
    - anchor.state
  - add update(appState) function to AnchorOverlay to homogenize api

- refactor2: anchor watch zone shapes
  - circle (anchor position + radius) 
  - polygon (to be implemented)
  - sector (to be implemented)
- when anchor up, UI shows the zone shape dropdown selector + zone shape controls (if any)
- when anchor down, UI shows the zone shape controls (if any)
- each zone shape class controls:
  - drawing zone on the map
  - zone shape controls
  - detecting inside/outside condition
  - passing zone configuration to AnchorController
- we also need a way to use the same class in the UI and in the backend to avoid duplication of code

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