# v2.8

- add missing signalk paths
  - navigation.anchor.apparentBearing
  - navigation.anchor.bearingTrue
  - navigation.anchor.distanceFromBow
  
- move login controls to settings panel
  - if not logged in, show the login link in the footer above version
  - if logged in, show a log out link
  - use links, not buttons, but use the existing modal flow.

- control toolbar
    - make Raise/Drop button square and put to the right of the shape and radius controls
    - should take up 2 rows

- combine settings and layer chooser into one control, with a line separator.
  - similar styling to the zoom in/out buttons
  - move light/dark mode to be top control
  - then settings and layers.
  - settings should be above layers

- navico mfd zoom scroll reverse
  - detect navico mfds using get params mfdName, mfdModel
  - if detected, reverse the zoom controls direction

- "chart" mode easter egg
  - long press on home button (3s) will enable
  - make the variable part of appstate so each ui widget can show/hide itself
  - control toolbar
    - hide anchor controls
    - show 'exit chart mode' button
  - hide the following
    - scope panel
    - wind panel
    - tide panel
    - anchor overlay (line + icon + zone shape)
    - status bar
  - on exit chart, switch back to normal anchor mode.

# LONG TERM

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