# v2.7

- local charts as toggleable map overlays (#21) — done
  - reads /signalk/v2/api/resources/charts (any charts provider plugin)
  - XYZ raster ("tilelayer") only for now; WMS + vector (mapstyleJSON) skipped
  - see ui/js/ChartLayers.js

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed