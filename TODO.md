# v2.7

- glitch filter - filter any moves that are over X speed
  - speed should be configurable in both the app and the plugin.
  - set to zero to disable
  - default 10kts (convert)
  - units should be signalk base units, but UI should show them as converted to the users unit preferences.
  - calculate the speed between last good position and current good position.
    - if less than X speed then accept at latest good positon
  - needs to filter on both UI and backend - glitched positions should not be able to trigger an alarm and should not pollute our UI.
- custom boat icon upload
  - possibly use signalk-symbol-manager, but it is only for SVG?
  - possibly use sk-image, but it needs node24 and also a bit heavy for what we need.
  - how are other signalk plugins handling this?
  - will need to be a UI only configuration option
  - add an api that accepts a file upload
  - image must be a 

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet