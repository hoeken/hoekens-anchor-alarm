# 2.11.0

## Shared / Core

- hide these elements when zoomed out far enough that they are not useful:
  - anchor line / labels / icon
  - zone outline / handles / etc

## HAA specific

- large UI components -> bump up boat name label text size
- small UI -> bump up anchor distance / bearing text by one px
- large UI -> bump up anchor distance / bearing text by one px from small ui

- add a small UI component styling to the anchor control bar to match the other small styles
- add a small UI styling mode for the wind barbs -> text the same, but wind barb much smaller
- add a small UI styling mode for the tide graph -> same as now, but slightly more compact

# LONG TERM

- investigate signalk-restricted-areas as an additional layer.

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
