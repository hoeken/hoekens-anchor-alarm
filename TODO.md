# v2.1

- convert to websocket instead of rest polling
  - first convert to a currentState / redraw() system
  - on load:
    - populate currentState with all the important variables
    - buildMap()
    - redrawMap(); 
  - on update (polling)
    - update currentState with new data
    - redrawMap();
  - on update (websockets)
    - each trigger updates currentState
    - redraw map w/ throttle?

- make filterRadius a plugin option
- respect units (kts / meters / etc)

# LONG TERM

- different anchor shapes (arc, polygon, etc)
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed