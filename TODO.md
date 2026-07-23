# 2.11.0

- backport large control styling from ../caveman-chartplotter
- add ui config option 'Use large UI controls'
  - toggles large/small UI control styling
- move ui config to being stored in a .json file in plugin storage
  - extract default config from plugin schema -> plugin member
  - remove plugin UI defaults from plugin config schema
  - each user can have their own separate UI config
  - ui-config api should look up based on auth token / username
    - same for saving

# LONG TERM

- investigate signalk-restricted-areas as an additional layer.

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
