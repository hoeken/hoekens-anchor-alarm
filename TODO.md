# v2.2

## Watch Zones

currently, there is only a single style of anchor watch available:  a circle with a center at anchor.position and radius of maxRadius.  i want to eventually expand that to allow for different types of anchor watch zone such as a sector, or a polygon.

in order to do that, we need to refactor the existing behavior out into a new class.

- anchor watch zone shapes
  - circle (anchor position + radius) 
  - polygon (to be implemented at a later date)
  - sector (to be implemented at a later date)
- AnchorWatchZone should have a getConfig that returns something like this:
  {
    type: "circle"
    radius: 50
  }
  or
  {
    type: "sector",
    radius: 60,
    start: 90,
    end: 270
  }
  or
  {
    type: "polygon",
    points: [...]
  }
- config should not contain the anchor position, that is stored in its own path in signalk.
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