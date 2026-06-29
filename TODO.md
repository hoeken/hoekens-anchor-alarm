# v2.5.0

- fix boat name label positioning
  - currently boat name label is positioned relative to the antenna, which may be placed at any point on the boat icon.
  - add a function to compute the center of the boat
  - position boat name label to be above the center of the boat, offset by a bit so it doesnt cover the icon

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed