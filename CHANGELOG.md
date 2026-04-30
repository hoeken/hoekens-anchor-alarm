# v1.3.3

* Startup notification visual only now.  Fixes #11

# v1.3

* added a table to bottom right with various scope suggestions based on depth + bow height above water + tidal delta
* plugin is now gps antenna location aware.  this makes calculation of the anchor bearing and distance more accurate
* added depth below surface to the info block
* fixed a bug when loading app and circle isnt over estimated anchor target
* radius guess is now a multiple of 5
* added required path checks to the plugin config page
* added new icons based on ais type of the boat

#v1.2

* removed openseamaps layer
* updated UI positions for one hand use on mobile
* fixed zoom issues with satellite imagery
* now defaults to satellite imagery layers

# v1.1.2

* fixed bug where position watchdog triggers when anchor alarm turned off
* fixed an error with other vessels historical tracks
* other vessels headings now parsed from AIS
* fix to properly display new track points loaded while page is open

# v1.1

* cleaned up global variables
* also show other vessels and their path history within filterRadius.
* prepopulate anchor position with a guess based on heading, depth, and gps offset
* re-send dragging alarm every X minutes w/ new distance
* add status text with current alarm status
* implement a no position watchdog alarm
* increased the max zoom
* change to draggable anchor
* preload icons
* race condition ui bugfix
* zoom to fit the anchor circle now
* fixed login on set radius

# v1.0

* update leaflet and jquery
* display high resolution history with paths plugin.
* add hotline to differentiate old vs new path: https://github.com/iosphere/Leaflet.hotline
* add line and distance to anchor to UI.
* added bearing to anchor to UI.
* added wind speed / angle
* boat going back inside radius should clear alarm
* anchor alarm should include distance in message.
* add check to propulsion.* before calling calling alarm.
* update plugin status when anchored, idle, or dragging.
* raise anchor on initial page load has a small bug with anchor location.
* load wind / depth data on first call
* web client tracks signalk state properly
* remove / cleanup extra stuff in the module
  * rodeLength
  * manual setting
  * warning levels - should be a binary trigger
  * config settings
  * altitude in dropAnchor calls