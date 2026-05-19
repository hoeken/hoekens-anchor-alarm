# v2.1 - Client

- respect units (kts / meters / etc)
  - server side - update metadata with category
- rotate anchor icon to match anchor line
- make FleetLayer.filterRadius a configurable option
- make Polling / Websocket a configurable option

# v2.1 - Server

- holy plugin abomination - needs refactor
- all functions -> plugin members
- all global variables -> plugin members
- getAnchorAlarmDelta -> updateAnchorAlarm(state, message) -> use queueDelta


# LONG TERM

- different anchor shapes (arc, polygon, etc)
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed