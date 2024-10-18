# hoekens-anchor-alarm

<a href="/screenshot.png"><img src="/screenshot.png" alt="drawing" width="50%" align="right"/></a>

This is a fork of the venerable [signalk-anchoralarm-plugin](https://github.com/sbender9/signalk-anchoralarm-plugin) by Scott Bender.

I wanted a simple, web-only anchor alarm with my own personal UI style and some features that may be controversial (like automatic alarm cancelling if your engines are running).  If you want to use an external app or API, you are probably better off using the old plugin.

Some of the changes I've made:

* Added historical tracks from [@signalk/tracks-plugin](https://github.com/SignalK/tracks)
  * I recommend setting this to a resolution of 1000ms and 86400 points to keep.  This gives you high resolution data for the last 24 hours.  If you've got plenty of memory, you might as well use it.
* Added a check to prevent anchor alarm from firing when engines are on
  * I always forget to turn the anchor alarm off and its annoying when it alarms as I'm motoring away.
  * If you're truly dragging and you have your motor(s) on, then you already know about it!
  * Plus, the act of turning on your engines will disable the alarm.  One less thing to do in an urgent situation.
* Lots of UI improvements:
  * Added colors to the historical tracks.  Green = new, fading to red = old
  * Inital anchor position guess is now pretty accurate
  * Added a line to show distance and bearing to anchor
  * Added status panel with: wind speed/direction, depth, alarm status
  * Set anchor position now by dragging instead of panning.
  * Cleaned up alarm radius UI
  * Increased the max zoom
  * Added other boats + their tracks
  * More responsive UI

# Usage

This plugin is intended to be used through the web interface with a phone or computer browser.  Simply point your Web Browser to `http://[signalk-server-ip-address]:[port-number]/hoekens-anchor-alarm/` and you can set your anchor alarm.

The way I use this app is to anchor the boat first, then once I'm settled I will use the webapp to set the anchor alarm.  This is where its good to have a high resolution on the tracks, as you can usually see exactly where you dropped the hook.  Make sure to set your radius a bit bigger to avoid false alarms.

If you have engine data in SignalK (`propulsion.*.rpm` or `propulsion.*.state`) then you can enable the engine check functionality. Then, when you leave the anchorage under engine power, it will automatically end the anchor watch.  Additionally, if you are dragging anchor and you start your engines to reposition, it will also disable the anchor alarm.  When your anchor is dragging, it can sometimes be hectic. There's no reason to bombard you with alarms when you are aware of it and getting it sorted.

## Setup Requirements

In order to take advantage of the extra features, make sure your SignalK is setup to provide the following data:

* `navigation.headingTrue` - if your plotter doesnt provide this, use `derived-data` plugin
* `environment.depth.belowTransducer` - to guess the scope based on your current depth
* `sensors.gps.fromBow` and `sensors.gps.fromCenter` - for more accurate anchor position guessing
* `data.environment.wind.directionTrue` and `environment.wind.speedApparent` - for UI
* `propulsion.*.rpm` or `propulsion.*.state` - used to determine if engines are on or not (optional)
* `design.length` and `design.beam` - for future use with accurate size icons

## Recommendations

This app pairs well with some other software:

* Node-RED + Pushbullet for push notifications to your phone.  Really great for when you're off the boat.  Also works when you're on the boat to get an alarm on your phone.
* `signalk-autostate` - Simply by using the anchor app, the plugin can automatically determine the difference between moored and anchored.  You can then use this to automate things like an anchor light.
* I highly recommend installing [Tailscale](https://tailscale.com/) on your devices.  It makes it so easy to access SignalK remotely.  Plus it's free and very simple to setup.

# Attribution

<a href="https://www.flaticon.com/free-icons/anchor" title="anchor icons">Anchor icons created by Freepik - Flaticon</a>
