/*
 * Copyright 2016 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const geolib = require('geolib')

const subscriberPeriod = 1000

module.exports = function (app) {
  var plugin = {};
  var schema;

  plugin.id = "hoekens-anchor-alarm"
  plugin.name = "Hoeken's Anchor Alarm"
  plugin.description = "Web app based anchor alarm with scope calculator, scribble tracks, engine override, and physically accurate icons."

  let requiredPaths = [
    {
      path: "navigation.position",
      description: "Required - you need a GPS position of some sort to watch."
    },
    {
      path: "design.beam",
      description: "Optional - used to display size-accurate icon. Edit Server -> Settings"
    },
    {
      path: "design.length",
      description: "Optional - used to display size-accurate icon. Edit Server -> Settings"
    },
    {
      path: "design.draft",
      description: "Optional - used for depth calculations. Edit Server -> Settings"
    },
    {
      path: "design.aisShipType",
      description: "Optional - used to choose the correct icon. Edit Server -> Settings"
    },
    {
      path: "environment.depth.belowTransducer",
      description: "Optional - used for scope calculations. No depthsounder found."
    },
    {
      path: "environment.depth.transducerToKeel",
      description: "Optional - used for scope calculations. You can set it with configuration options below. "
    },
    {
      path: "environment.depth.belowSurface",
      description: "Optional - used for scope calculations. Provided by plugin derived-data"
    },
    {
      path: "environment.tide",
      description: "Optional - used for scope calculations. Tide data provided by plugin signalk-tides"
    },
    {
      path: "propulsion",
      description: "Optional - used for automatic alarm override. Install plugin or hardware to interface with your engines."
    },
    {
      path: "sensors.gps.fromBow",
      description: "Optional - used to display size-accurate icon. GPS Antenna position. Edit Server -> Settings"
    },
    {
      path: "sensors.gps.fromCenter",
      description: "Optional - used to display size-accurate icon. GPS Antenna position. Edit Server -> Settings"
    },
  ];

  plugin.schema = function () {
    updateSchema()
    return schema
  };

  function updateSchema() {
    schema = {
      title: "Hoeken's Anchor Alarm",
      type: "object",
      required: [
        "radius",
        "active",
      ],
      properties: {
        pathChecks: {
          title: "Path Checks",
          type: 'object',
          properties: {},
        },
        state: {
          title: "Alarm Severity",
          description: "Anchor alarm notification level",
          type: "string",
          default: "emergency",
          "enum": ["alert", "warn", "alarm", "emergency"]
        },
        enableEngineCheck: {
          type: 'boolean',
          title: 'Engine Override Enabled',
          description: "Check propulsion.* to see if the engines are on before sending alarm notification.",
          default: true
        },
        anchorAlarmInterval: {
          type: "number",
          title: "How often to send anchor alarm when dragging (in seconds).  Zero is continuously.",
          default: 60
        },
        noPositionAlarmTime: {
          type: "number",
          title: "Send a notification if no position is received for the given number of seconds",
          default: 60
        },
        bowAnchorRollerHeight: {
          type: "number",
          title: "Height of the bow anchor roller above the waterline (in meters).  Used for scope calculations.",
          default: 0
        },
        transducerToKeel: {
          type: "number",
          title: "Distance between the transducer and the keel (in meters, should be negative).  Useful if your install doesn't automatically detect this. 0 and above are ignored.",
          default: 0
        },
        on: {
          type: 'boolean',
          title: 'Alarm On',
          description: "Used for saving state in case of SignalK restart.",
          default: false
        },
        radius: {
          type: "number",
          title: "Alarm Radius (m)",
          description: "Used for saving state in case of SignalK restart.",
          default: 60
        },
        position: {
          type: "object",
          title: "Anchor Position",
          description: "Used for saving state in case of SignalK restart.",
          properties: {
            latitude: {
              title: "Latitude",
              type: "number"
            },
            longitude: {
              title: "Longitude",
              type: "number"
            }
          }
        }
      }
    };

    let pathChecks = {};
    for (const myPath of requiredPaths) {
      pathChecks[myPath.path] = {
        title: `${app.getSelfPath(myPath.path) ? '✅' : '❌'} ${myPath.path}`,
        description: app.getSelfPath(myPath.path) ? "" : myPath.description,
        type: 'null',
        readOnly: true,
        default: null
      };
    }

    schema.properties.pathChecks.properties = pathChecks;
  };

  let onStop = [];
  let alarm_state;
  let configuration;
  let lastAlarmSent = 0;
  let positionWatchdogTimer = false;

  plugin.start = function (props) {

    app.setPluginStatus("Started");

    alarm_state = "normal"
    var delta = getAnchorAlarmDelta(app, alarm_state, "Started", ["visual"])
    app.handleMessage(plugin.id, delta)

    configuration = props
    try {

      //save our anchor roller height to the tree so we can access it from the web side
      if (typeof configuration['bowAnchorRollerHeight'] != 'undefined') {
        app.handleMessage(plugin.id, {
          updates: [
            {
              meta: [
                {
                  path: 'design.bowAnchorRollerHeight',
                  value: { units: 'm' }
                }
              ],
              values: [
                {
                  path: "design.bowAnchorRollerHeight",
                  value: parseFloat(configuration['bowAnchorRollerHeight'])
                }
              ]
            }
          ]
        })
      }

      //save our depthsounder config to the tree so it can be used to calculate depth below surface
      if (typeof configuration['transducerToKeel'] != 'undefined' && parseFloat(configuration['transducerToKeel']) < 0) {
        app.handleMessage(plugin.id, {
          updates: [
            {
              meta: [
                {
                  path: 'environment.depth.transducerToKeel',
                  value: { units: 'm' }
                }
              ],
              values: [
                {
                  path: "environment.depth.transducerToKeel",
                  value: parseFloat(configuration['transducerToKeel'])
                }
              ]
            }
          ]
        })
      }

      //setup our watchdog timer
      let noPositionAlarmTime = configuration["noPositionAlarmTime"];
      if (typeof noPositionAlarmTime != 'undefined') {
        if (noPositionAlarmTime > 0) {
          positionWatchdogTimer = new Watchdog(noPositionAlarmTime * 1000, () => {
            alarm_state = "warn";
            var delta = getAnchorAlarmDelta(app, alarm_state, `No position data received for ${noPositionAlarmTime} seconds.`);
            app.handleMessage(plugin.id, delta)
          });
        }
      }

      //should we be watching?
      var isOn = configuration['on']
      var position = configuration['position']
      var radius = configuration['radius']
      if (typeof isOn != 'undefined'
        && isOn
        && typeof position != 'undefined'
        && typeof radius != 'undefined') {
        startWatchingPosition()
      }

      //api for the web app
      if (app.registerActionHandler) {
        app.registerActionHandler('vessels.self',
          `navigation.anchor.position`,
          putPosition)

        app.registerActionHandler('vessels.self',
          `navigation.anchor.maxRadius`,
          putRadius)
      }

      //set some units
      app.handleMessage(plugin.id, {
        updates: [
          {
            meta: [
              {
                path: 'navigation.anchor.bearingTrue',
                value: { units: 'rad' }
              },
              {
                path: 'navigation.anchor.apparentBearing',
                value: { units: 'rad' }
              }
            ],
          }
        ]
      })

    } catch (e) {
      plugin.started = false
      app.error("error: " + e);
      console.error(e.stack)
      return e
    }
  }

  function savePluginOptions() {
    //app.debug('saving options..')
    app.savePluginOptions(configuration, err => {
      if (err) {
        app.error(err)
      }
    })
  }

  function putRadius(context, path, value, cb) {
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: "navigation.anchor.maxRadius",
              value: parseFloat(value)
            }
          ]
        }
      ]
    })

    configuration["radius"] = parseFloat(value)
    if (configuration["position"]) {
      configuration["on"] = true
      startWatchingPosition()
    }

    try {
      savePluginOptions()
      return { state: 'SUCCESS' }
    } catch (err) {
      app.error(err)
      return { state: 'FAILURE', message: err.message }
    }
  }

  function putPosition(context, path, value, cb) {
    try {
      if (value == null) {
        raiseAnchor()
      } else {
        var delta = getAnchorDelta({
          app: app,
          anchorPosition: value,
          maxRadius: configuration["radius"],
          isSet: true
        });
        app.handleMessage(plugin.id, delta)

        configuration["position"] = { "latitude": parseFloat(value.latitude), "longitude": parseFloat(value.longitude) }

        configuration["radius"] = parseFloat(value.radius)
        if (configuration["radius"]) {
          configuration["on"] = true
          startWatchingPosition()
        }

        savePluginOptions()
      }
      return { state: 'SUCCESS' }
    } catch (err) {
      app.error(err)
      return { state: 'FAILURE', message: err.message }
    }
  }

  plugin.stop = function () {
    if (alarm_state != "normal") {
      alarm_state = "normal"
      var delta = getAnchorAlarmDelta(app, alarm_state, "Stopped")
      app.handleMessage(plugin.id, delta)
    }

    var delta = getAnchorDelta({
      app: app,
      isSet: false
    });
    app.handleMessage(plugin.id, delta)

    stopWatchingPosition()

    app.setPluginStatus("Stopped");
  }

  function startWatchingPosition() {
    if (onStop.length > 0)
      return

    alarm_state = "normal"
    var delta = getAnchorAlarmDelta(app, alarm_state, "Watching")
    app.handleMessage(plugin.id, delta)

    app.setPluginStatus("Watching");

    if (positionWatchdogTimer)
      positionWatchdogTimer.start();

    app.subscriptionmanager.subscribe(
      {
        context: 'vessels.self',
        subscribe: [
          {
            path: 'navigation.position',
            period: subscriberPeriod
          },
          {
            path: 'navigation.headingTrue',
            period: subscriberPeriod
          }
        ]
      },
      onStop,
      (err) => {
        app.error(err)
        app.setProviderError(err)
      },
      (delta) => {
        let vesselPosition, trueHeading

        if (delta.updates) {
          delta.updates.forEach(update => {
            if (update.values) {
              update.values.forEach(vp => {
                if (vp.path === 'navigation.position') {
                  vesselPosition = vp.value
                } else if (vp.path === 'navigation.headingTrue') {
                  trueHeading = vp.value
                }
              })
            }
          })
        }

        if (vesselPosition) {
          if (positionWatchdogTimer)
            positionWatchdogTimer.reset();
          checkPosition(app, plugin, vesselPosition, configuration);
        }
      }
    )
  }

  function stopWatchingPosition() {
    alarm_state = "normal"
    var delta = getAnchorAlarmDelta(app, alarm_state, "Off")
    app.handleMessage(plugin.id, delta)

    if (positionWatchdogTimer)
      positionWatchdogTimer.stop();

    app.setPluginStatus("Off");

    onStop.forEach(f => f())
    onStop = []
  }

  function raiseAnchor() {
    app.debug("raise anchor")

    var delta = getAnchorDelta({
      app: app,
      isSet: false
    });
    app.handleMessage(plugin.id, delta)

    delete configuration["position"]
    delete configuration["radius"]
    configuration["on"] = false

    stopWatchingPosition()

    savePluginOptions()
  }

  plugin.registerWithRouter = function (router) {

    router.post("/dropAnchor", (req, res) => {
      var position = req.body['position']

      if (typeof position == 'undefined') {
        app.debug("no position supplied")
        res.status(403)
        res.json({
          statusCode: 403,
          state: 'FAILED',
          message: "no position supplied"
        })
      }
      else {
        app.debug("set anchor position to: " + position.latitude + " " + position.longitude)
        var radius = req.body['radius']
        if (typeof radius == 'undefined')
          radius = null

        var delta = getAnchorDelta({
          app: app,
          anchorPosition: position,
          currentRadius: 0,
          maxRadius: radius,
          isSet: true
        })

        app.handleMessage(plugin.id, delta)

        //app.debug("anchor delta: " + JSON.stringify(delta))

        configuration["position"] = {
          "latitude": parseFloat(position.latitude),
          "longitude": parseFloat(position.longitude)
        }
        configuration["radius"] = parseFloat(radius)
        configuration["on"] = true

        startWatchingPosition()

        try {
          savePluginOptions()
          res.json({
            statusCode: 200,
            state: 'COMPLETED'
          })
        } catch (err) {
          app.error(err)
          res.status(500)
          res.json({
            statusCode: 500,
            state: 'FAILED',
            message: "can't save config"
          })
        }
      }
    })

    router.post("/setRadius", (req, res) => {
      let position = app.getSelfPath('navigation.position')
      if (position.value)
        position = position.value
      if (typeof position == 'undefined') {
        app.debug("no position supplied")
        res.status(403)
        res.json({
          statusCode: 403,
          state: 'FAILED',
          message: "no position supplied"
        })
      }
      else {
        var radius = req.body['radius']
        if (typeof radius == 'undefined') {
          app.debug("no radius supplied")
          res.status(403)
          res.json({
            statusCode: 403,
            state: 'FAILED',
            message: "no radius supplied"
          })
          return
        }

        app.debug("set anchor radius: " + radius)

        var delta = getAnchorDelta({
          app: app,
          vesselPosition: position,
          anchorPosition: configuration.position,
          maxRadius: radius,
          isSet: false
        })
        app.handleMessage(plugin.id, delta)

        configuration["radius"] = parseFloat(radius)

        try {
          savePluginOptions()
          res.json({
            statusCode: 200,
            state: 'COMPLETED'
          })
        } catch (err) {
          app.error(err)
          res.status(500)
          res.json({
            statusCode: 500,
            state: 'FAILED',
            message: "can't save config"
          })
        }
      }
    })

    router.post("/raiseAnchor", (req, res) => {
      try {
        raiseAnchor()
        res.json({
          statusCode: 200,
          state: 'COMPLETED'
        })
      } catch (err) {
        app.error(err)
        res.status(500)
        res.json({
          statusCode: 500,
          state: 'FAILED',
          message: "can't save config"
        })
      }
    })
  }

  function getAnchorDelta(params) {
    var values

    if (params.vesselPosition == null) {
      params.vesselPosition = params.app.getSelfPath('navigation.position.value')
    }

    if (params.anchorPosition) {
      var anchorPosition = {
        "latitude": parseFloat(params.anchorPosition.latitude),
        "longitude": parseFloat(params.anchorPosition.longitude)
      };

      values = [
        {
          path: "navigation.anchor.position",
          value: anchorPosition
        },
        {
          path: 'navigation.anchor.state',
          value: 'on'
        }
      ]

      if (params.currentRadius != null) {
        values.push({
          path: 'navigation.anchor.currentRadius',
          value: parseFloat(params.currentRadius)
        })
      }

      if (params.maxRadius != null) {
        var maxRadius = parseFloat(params.maxRadius);
        values.push({
          path: 'navigation.anchor.maxRadius',
          value: maxRadius
        })
        var zones = [
          {
            state: "normal",
            lower: 0,
            upper: maxRadius
          },
          {
            state: configuration.state,
            lower: maxRadius
          }
        ];

        values.push({
          path: 'navigation.anchor.meta',
          value: {
            zones: zones
          }
        })
      }
    }
    else {
      values = [
        {
          path: 'navigation.anchor.position',
          value: null //{ latitude: null, longitude: null}
        },
        {
          path: 'navigation.anchor.state',
          value: 'off'
        },
        {
          path: 'navigation.anchor.currentRadius',
          value: null
        },
        {
          path: 'navigation.anchor.maxRadius',
          value: null
        }
      ]
    }

    var delta = {
      "updates": [
        {
          "values": values
        }
      ]
    }

    // params.app.debug("anchor delta: " + util.inspect(delta, { showHidden: false, depth: 6 }))
    return delta;
  }

  function checkPosition(app, plugin, vesselPosition, configuration) {
    //app.debug("in checkPosition: " + position.latitude + ',' + anchor_position.latitude)

    let maxRadius = configuration.radius
    let anchorPosition = configuration.position

    var currentRadius = calc_distance(vesselPosition.latitude, vesselPosition.longitude,
      anchorPosition.latitude, anchorPosition.longitude);

    //app.debug("currentRadius: " + currentRadius + ", maxRadius: " + maxRadius);

    var delta = getAnchorDelta({
      app: app,
      vesselPosition: vesselPosition,
      anchorPosition: anchorPosition,
      currentRadius: currentRadius,
      maxRadius: maxRadius,
      isSet: false
    })
    app.handleMessage(plugin.id, delta)

    let new_state = "normal";
    let do_update = false;
    let message = "Watching";

    //compare our radius
    if (maxRadius != null && currentRadius > maxRadius) {
      //okay, we're dragging.
      new_state = configuration.state;
      message = `Anchor Dragging (${Math.round(currentRadius)}m)`;

      //how often should we send it?
      let interval = configuration["anchorAlarmInterval"];
      if (typeof interval !== "undefined")
        if ((lastAlarmSent + interval * 1000) < Date.now())
          do_update = true;

      //wait, do we have engines on?
      if (configuration.enableEngineCheck) {
        if (checkEngineState(app, plugin)) {
          app.debug("anchor alarm disabled due to engines on: %j", delta)
          do_update = true;
          new_state = "normal";
          message = "Engines on, alarm disabled.";

          raiseAnchor();

          app.setPluginStatus(message);
        }
      }
    }

    if (new_state !== alarm_state || do_update) {
      alarm_state = new_state;
      var delta = getAnchorAlarmDelta(app, alarm_state, message)
      app.debug("alarm state change: %j", delta)
      app.handleMessage(plugin.id, delta)


      if (alarm_state == "normal")
        app.setPluginStatus("Watching");
      else {
        lastAlarmSent = Date.now();
        app.setPluginError("Dragging");
      }
    }
  }

  return plugin;
}

function checkEngineState(app, plugin) {
  const propulsion = app.getSelfPath('propulsion');

  if (typeof propulsion !== 'undefined') {
    const propulsionKeys = Object.keys(propulsion);

    for (let key of propulsionKeys) {
      if (propulsion[key] && propulsion[key].revolutions && propulsion[key].revolutions.value > 0)
        return true;
      if (propulsion[key] && propulsion[key].state && propulsion[key].state.value === 'started')
        return true;
    }
  }

  return false;
}

function calc_distance(lat1, lon1, lat2, lon2) {
  //app.debug("calc_distance: " + lat1 + ", " + lon1 + ", " + lat2 + ", " + lon2)
  var R = 6371000; // Radius of the earth in m
  var dLat = degsToRad(lat2 - lat1);  // deg2rad below
  var dLon = degsToRad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degsToRad(lat1)) * Math.cos(degsToRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in m
  return d;
}

function getAnchorAlarmDelta(app, state, msg, method) {
  if (!msg)
    msg = state.charAt(0).toUpperCase() + state.slice(1)

  if (!method)
    method = ["visual", "sound"]

  var delta = {
    "updates": [
      {
        "values": [
          {
            "path": "notifications.navigation.anchor",
            "value": {
              "state": state,
              method,
              "message": msg,
            }
          }]
      }
    ]
  }
  return delta;
}

function radsToDeg(radians) {
  return radians * 180 / Math.PI
}

function degsToRad(degrees) {
  return degrees * (Math.PI / 180.0);
}

function mod(x, y) {
  return x - y * Math.floor(x / y)
}

class Watchdog {
  constructor(timeout, onTimeout) {
    this.timeout = timeout;
    this.onTimeout = onTimeout;
    this.timer = null;
  }

  start() {
    this.stop(); // Clear any existing timer
    this.timer = setTimeout(() => {
      this.onTimeout();
    }, this.timeout);
  }

  reset() {
    this.start(); // Restart the timer
  }

  stop() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
