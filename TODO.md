# v2.3

- replace control toolbar buttons with login if not logged in.
  - add a login button div to #controlToolbar
  - button should be styled like dropAnchor and raiseAnchor
  - on update, check state.isLoggedIn
    - if false, show login button (same link to login with redirect)
    - if true, show regular UI

- also check appState.loggedIn to decide whether to show or hide the control handles on zone shapes

- do not save zone if .contains() fails

- other ui tweaks to make things crispy
  - same border on panels + buttons?
  - button background color not the same

- new plugin publish (screenshots, suggested, etc): https://github.com/SignalK/signalk-server/blob/master/docs/develop/plugins/publishing.md

# LONG TERM

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed