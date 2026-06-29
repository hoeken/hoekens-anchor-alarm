# v2.5.0

- raise/drop still not working navico
- FleetLayer track rendering broken on Navico (Chromium 69): `getLatLngs().at(-1)` in ui/js/hud/FleetLayer.js uses Array.prototype.at() (Chrome 92+, absent on Chromium 69). Replace with slice(-1)[0] / index math.
- fix boat name label to be based on center of boat instead of antenna
- update icon - 5% pullback + better background

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed