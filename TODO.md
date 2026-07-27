# 2.11.2

- change anchor position icon
  - no more crosshair and anchor icons for anchor position
  - instead, use js/hud/zones/ZoneHandle.js
  - use the same handle for unanchored / anchored states
  - allow the user to drag the anchor position, even while anchored
  - only save the new anchor position / shape on drag/move end

- anchor distance/bearing text hiding is too sensitive
  - sometimes if even a corner of the box crosses a corner of the boat icon it goes away
  - can we make it less sensitive?

# LONG TERM

- investigate signalk-restricted-areas as an additional layer.

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
