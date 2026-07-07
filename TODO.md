# v2.8

- control toolbar UI refactor:
  - we want to reduce the vertical height the control toolbar takes up.  right now when the anchor is raised, it has 3 vertically stacked controls.
    - i want to change that to horizontally stacked controls
    - controls should have a height of 90px with no fixed width yet.
    from right to left:
    - shape selector -> dont use text and instead use an SVG representation of the shape.  keep it a dropdown
    - anchor radius selector -> build an all-in-one control similar to the zoom in/out control.
      - normal control/panel border on the outside
      - lightweight borders on the inside to separate internal controls
      - two rows:
        - radius on top, centered
        - -/+ buttons on bottom, equal width, 2 columns
        - switch to using the same font and styling as the zoom buttons for these +/- buttons
      - for polygon, sides selector on top, reset button on bottom.
    - raise/drop button -> change text to simple Raise/Drop with an anchor icon emoji above the text

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

- investigate signalk-restricted-areas as an additional layer.

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