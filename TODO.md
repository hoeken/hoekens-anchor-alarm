# v2.1

- add AppState.checkFreshness() to AnchorAlarm.update()

- convert to websocket instead of rest polling
  - notification anchor up / down isnt working.
  - tides updates?
  
- respect units (kts / meters / etc)

- make FleetLayer.filterRadius a configurable option
- make Polling / Websocket a configurable option

# LONG TERM

- different anchor shapes (arc, polygon, etc)
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed