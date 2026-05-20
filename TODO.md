# v2.1

- make tide ui configurable (boolean on/off, default true (on))
- make wind ui configurable (boolean on/off, default true (on))
- test with various sources disabled:
  - tides
  - derivative-data
  - etc

# v2.2

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

# LONG TERM

- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed