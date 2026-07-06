# v2.7

- add blank base layer option for no/slow internet or people with their own charts — done
  - "Blank" base layer (empty L.layerGroup) in the layer control + Default Basemap setting
  - fetches no tiles: shows the themed map background with any chart overlays on top
  - see AnchorAlarm.blankLayer / hud/ConfigPanel.js
- remove icon generation from the build script
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet