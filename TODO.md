# v2.1

- add AppState.checkFreshness() to AnchorAlarm.update()

- convert to websocket instead of rest polling
  - add websocket connection
  - subscribe to relevant topics
  - on update (websockets)
    - each trigger updates AppState
  - redraw map on interval?

- respect units (kts / meters / etc)

- make FleetLayer.filterRadius a configurable option
- make Polling / Websocket a configurable option

# LONG TERM

- different anchor shapes (arc, polygon, etc)
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed