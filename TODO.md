# v2.4

* add unit tests to this project.
  * [x] shared/watch-zones (alarm geometry) — `npm test`
  * [x] src/utils (engine-override + freshness), src/schema (config migrate/coerce/defaults)
  * [x] ui/js GeoMath (tide estimate), DisplayUnit (unit conversion/formatting)
  * [ ] src/ signalk plugin lifecycle (index.js, signalk-bus, http-routes, watchdog) — needs a mock app

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed