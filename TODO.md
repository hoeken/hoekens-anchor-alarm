# v2.9

- fix vessel tracks crossing 180E/W longitude bug
  - currently a line crossing the anti-meridian will draw from one side of the map to the other and cause all sorts of problems.

- ui should not reference notifications.navigation.anchor for state, use navigation.anchor.state instead.

# LONG TERM

- investigate forking into a separate simple chart plotter
- investigate signalk-restricted-areas as an additional layer.

- glitch filter - filter any moves that are over X speed
  - speed should be configurable in both the app and the plugin.
  - set to zero to disable.  default 0 (disabled)
  - units should be signalk base units, but UI should show them as converted to the users unit preferences.
  - calculate the speed between last good position and current good position.
    - if less than X speed then accept at latest good positon
  - needs to filter on both UI and backend
    - glitched positions should not be able to trigger an alarm
    - glitched positions should not pollute our UI track
    - glitches on the front end should show an error, cleared on the next good position
    - glitches on the back end should show a plugin error, cleared on next good position

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet