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

const Utils = require("./utils");
const Watchdog = require("./watchdog");

module.exports = function (app) {
  var plugin = {};

  // ============================================================
  // PLUGIN IDENTITY & STATE
  // ============================================================

  plugin.id = "hoekens-anchor-alarm";
  plugin.name = "Hoeken's Anchor Alarm";
  plugin.description = "Anchor alarm with scope calculator, scribble tracks, engine override, and physically accurate icons.";

  plugin.subscriberPeriod = 1000;

  plugin.metaQueue = [];
  plugin.deltaQueue = [];

  plugin.schemaData = undefined;
  plugin.onStop = [];
  plugin.alarm_state = undefined;
  plugin.configuration = undefined;
  plugin.lastAlarmSent = 0;
  plugin.positionWatchdogTimer = false;

  // ============================================================
  // SIGNALK PATH METADATA
  // ============================================================

  plugin.metas = {
    "design.bowAnchorRollerHeight": {
      units: "m",
      displayUnits: {
        category: "length",
      },
      description: "Height of the bow anchor roller above the water",
    },
    "navigation.anchor.currentRadius": {
      units: "m",
      displayUnits: {
        category: "length",
      },
      description: "Current distance from gps antenna to anchor",
    },
    "navigation.anchor.maxRadius": {
      units: "m",
      displayUnits: {
        category: "length",
      },
      description: "Current distance from gps antenna to anchor",
    },
    // "navigation.anchor.meta": { "units": "", "description": "Whether this channel hardware is capable of PWM (duty cycle, dimming, etc)" },
    "navigation.anchor.position": {
      description: "Anchor position, probably an estimate at best",
    },
    "navigation.anchor.state": { "description": "Anchor alarm state: 'on' or 'off'" },
  };

  plugin.requiredPaths = [
    {
      path: "navigation.position",
      description: "Required - you need a GPS position of some sort to watch.",
    },
    {
      path: "design.beam",
      description:
        "Optional - used to display size-accurate icon. Edit Server -> Settings",
    },
    {
      path: "design.length",
      description:
        "Optional - used to display size-accurate icon. Edit Server -> Settings",
    },
    {
      path: "design.aisShipType",
      description:
        "Optional - used to choose the correct icon. Edit Server -> Settings",
    },
    {
      path: "environment.depth.belowSurface",
      description:
        "Optional - used for scope calculations. Provided by plugin derived-data",
    },
    {
      path: "environment.tide",
      description:
        "Optional - used for scope calculations. Tide data provided by plugin signalk-tides",
    },
    {
      path: "propulsion",
      description:
        "Optional - used for automatic alarm override. Install plugin or hardware to interface with your engines.",
    },
    {
      path: "sensors.gps.fromBow",
      description:
        "Optional - used to display size-accurate icon. GPS Antenna position. Edit Server -> Settings",
    },
    {
      path: "sensors.gps.fromCenter",
      description:
        "Optional - used to display size-accurate icon. GPS Antenna position. Edit Server -> Settings",
    },
  ];

  // ============================================================
  // CONFIGURATION SCHEMA
  // ============================================================

  plugin.schema = function () {
    plugin.updateSchema();
    return plugin.schemaData;
  };

  plugin.updateSchema = function () {
    plugin.schemaData = {
      title: "Hoeken's Anchor Alarm",
      type: "object",
      required: ["radius"],
      properties: {
        pathChecks: {
          title: "Path Checks",
          type: "object",
          properties: {},
        },
        state: {
          title: "Alarm Severity",
          description: "Anchor alarm notification level",
          type: "string",
          default: "emergency",
          enum: ["alert", "warn", "alarm", "emergency"],
        },
        enableEngineCheck: {
          type: "boolean",
          title: "Engine Override Enabled",
          description:
            "Check propulsion.* to see if the engines are on before sending alarm notification.",
          default: true,
        },
        anchorAlarmInterval: {
          type: "number",
          title:
            "How often to send anchor alarm when dragging (in seconds).  Zero is continuously.",
          default: 60,
        },
        noPositionAlarmTime: {
          type: "number",
          title:
            "Send a notification if no position is received for the given number of seconds",
          default: 60,
        },
        bowAnchorRollerHeight: {
          type: "number",
          title:
            "Height of the bow anchor roller above the waterline (in meters).  Used for scope calculations.",
          default: 0,
        },
        on: {
          type: "boolean",
          title: "Alarm On",
          description: "Used for saving state in case of SignalK restart.",
          default: false,
        },
        radius: {
          type: "number",
          title: "Alarm Radius (m)",
          description: "Used for saving state in case of SignalK restart.",
          default: 60,
        },
        position: {
          type: "object",
          title: "Anchor Position",
          description: "Used for saving state in case of SignalK restart.",
          properties: {
            latitude: {
              title: "Latitude",
              type: "number",
            },
            longitude: {
              title: "Longitude",
              type: "number",
            },
          },
        },
      },
    };

    let pathChecks = {};
    for (const myPath of plugin.requiredPaths) {
      pathChecks[myPath.path] = {
        title: `${app.getSelfPath(myPath.path) ? "✅" : "❌"} ${myPath.path}`,
        description: app.getSelfPath(myPath.path) ? "" : myPath.description,
        type: "null",
        readOnly: true,
        default: null,
      };
    }

    plugin.schemaData.properties.pathChecks.properties = pathChecks;
  };

  // ============================================================
  // PLUGIN LIFECYCLE
  // ============================================================

  plugin.start = function (props) {
    app.setPluginStatus("Started");

    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Started", ["visual"]);

    for (const [key, value] of Object.entries(plugin.metas))
      plugin.queueMeta(key, value);

    plugin.configuration = props;
    try {
      //save our anchor roller height to the tree so we can access it from the web side
      if (typeof plugin.configuration["bowAnchorRollerHeight"] != "undefined")
        plugin.queueDelta("design.bowAnchorRollerHeight", parseFloat(plugin.configuration["bowAnchorRollerHeight"]));

      //setup our watchdog timer
      let noPositionAlarmTime = plugin.configuration["noPositionAlarmTime"];
      if (typeof noPositionAlarmTime != "undefined") {
        if (noPositionAlarmTime > 0) {
          plugin.positionWatchdogTimer = new Watchdog(
            noPositionAlarmTime * 1000,
            () => {
              plugin.alarm_state = "warn";
              plugin.updateAnchorAlarm(
                plugin.alarm_state,
                `No position data received for ${noPositionAlarmTime} seconds.`,
              );
            },
          );
        }
      }

      //should we be watching?
      var isOn = plugin.configuration["on"];
      var position = plugin.configuration["position"];
      var radius = plugin.configuration["radius"];
      if (
        typeof isOn != "undefined" &&
        isOn &&
        typeof position != "undefined" &&
        typeof radius != "undefined"
      ) {
        plugin.startWatchingPosition();
      }

      //api for the web app
      if (app.registerActionHandler) {
        app.registerActionHandler(
          "vessels.self",
          `navigation.anchor.position`,
          plugin.putPosition,
        );

        app.registerActionHandler(
          "vessels.self",
          `navigation.anchor.maxRadius`,
          plugin.putRadius,
        );
      }
    } catch (e) {
      plugin.started = false;
      app.error("error: " + e);
      console.error(e.stack);
      return e;
    }

    plugin.sendUpdates();
  };

  plugin.stop = function () {
    if (plugin.alarm_state != "normal") {
      plugin.alarm_state = "normal";
      plugin.updateAnchorAlarm(plugin.alarm_state, "Stopped");
    }

    plugin.updateAnchorState({
      isSet: false,
    });

    plugin.stopWatchingPosition();

    app.setPluginStatus("Stopped");
  };

  // ============================================================
  // DELTA & META QUEUEING
  // ============================================================

  plugin.queueDelta = function (path, value) {
    plugin.deltaQueue.push({ "path": path, "value": value });
  };

  plugin.queueMeta = function (path, value) {
    let meta = {
      "path": path,
      "value": value,
    };

    plugin.metaQueue.push(meta);
  };

  plugin.sendDeltas = function () {
    if (!plugin.deltaQueue.length)
      return;

    app.handleMessage(plugin.id, {
      "updates": [{
        "values": plugin.deltaQueue,
      }],
    });

    plugin.deltaQueue = [];
  };

  plugin.sendMetas = function () {
    if (!plugin.metaQueue.length)
      return;

    app.handleMessage(plugin.id, {
      "updates": [{
        "meta": plugin.metaQueue,
      }],
    });

    plugin.metaQueue = [];
  };

  plugin.sendUpdates = function () {
    plugin.sendDeltas();
    plugin.sendMetas();
  };

  // ============================================================
  // ANCHOR STATE UPDATES
  // ============================================================

  plugin.updateAnchorAlarm = function (state, message, method) {
    if (!message)
      message = state.charAt(0).toUpperCase() + state.slice(1);

    if (!method)
      method = ["visual", "sound"];

    plugin.queueDelta("notifications.navigation.anchor", {
      state: state,
      method: method,
      message: message,
    });

    plugin.sendUpdates();
  };

  plugin.updateAnchorState = function (params) {
    if (params.vesselPosition == null) {
      params.vesselPosition = app.getSelfPath("navigation.position.value");
    }

    if (params.anchorPosition) {
      var anchorPosition = {
        latitude: parseFloat(params.anchorPosition.latitude),
        longitude: parseFloat(params.anchorPosition.longitude),
      };

      plugin.queueDelta("navigation.anchor.position", anchorPosition);
      plugin.queueDelta("navigation.anchor.state", "on");

      if (params.currentRadius != null) {
        plugin.queueDelta(
          "navigation.anchor.currentRadius",
          parseFloat(params.currentRadius),
        );
      }

      if (params.maxRadius != null) {
        var maxRadius = parseFloat(params.maxRadius);
        plugin.queueDelta("navigation.anchor.maxRadius", maxRadius);
        var zones = [
          {
            state: "normal",
            lower: 0,
            upper: maxRadius,
          },
          {
            state: plugin.configuration.state,
            lower: maxRadius,
          },
        ];
        plugin.queueDelta("navigation.anchor.meta", { zones: zones });
      }
    } else {
      plugin.queueDelta("navigation.anchor.position", null);
      plugin.queueDelta("navigation.anchor.state", "off");
      plugin.queueDelta("navigation.anchor.currentRadius", null);
      plugin.queueDelta("navigation.anchor.maxRadius", null);
    }

    plugin.sendUpdates();
  };

  // ============================================================
  // ANCHOR OPERATIONS
  // ============================================================

  plugin.raiseAnchor = function () {
    app.debug("raise anchor");

    plugin.updateAnchorState({
      isSet: false,
    });

    delete plugin.configuration["position"];
    delete plugin.configuration["radius"];
    plugin.configuration["on"] = false;

    plugin.stopWatchingPosition();

    plugin.savePluginOptions();
  };

  // ============================================================
  // POSITION MONITORING
  // ============================================================

  plugin.startWatchingPosition = function () {
    if (plugin.onStop.length > 0)
      return;

    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Watching");

    app.setPluginStatus("Watching");

    if (plugin.positionWatchdogTimer)
      plugin.positionWatchdogTimer.start();

    app.subscriptionmanager.subscribe(
      {
        context: "vessels.self",
        subscribe: [
          {
            path: "navigation.position",
            period: plugin.subscriberPeriod,
          },
        ],
      },
      plugin.onStop,
      (err) => {
        app.error(err);
        app.setProviderError(err);
      },
      (delta) => {
        let vesselPosition;

        if (delta.updates) {
          delta.updates.forEach((update) => {
            if (update.values) {
              update.values.forEach((vp) => {
                if (vp.path === "navigation.position") {
                  vesselPosition = vp.value;
                }
              });
            }
          });
        }

        if (vesselPosition) {
          if (plugin.positionWatchdogTimer)
            plugin.positionWatchdogTimer.reset();
          plugin.checkPosition(app, plugin, vesselPosition, plugin.configuration);
        }
      },
    );
  };

  plugin.stopWatchingPosition = function () {
    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Off");

    if (plugin.positionWatchdogTimer)
      plugin.positionWatchdogTimer.stop();

    app.setPluginStatus("Off");

    plugin.onStop.forEach((f) => f());
    plugin.onStop = [];
  };

  plugin.checkPosition = function (app, plugin, vesselPosition, configuration) {
    //app.debug("in checkPosition: " + position.latitude + ',' + anchor_position.latitude)

    let maxRadius = configuration.radius;
    let anchorPosition = configuration.position;

    var currentRadius = Utils.calc_distance(
      vesselPosition.latitude,
      vesselPosition.longitude,
      anchorPosition.latitude,
      anchorPosition.longitude,
    );

    //app.debug("currentRadius: " + currentRadius + ", maxRadius: " + maxRadius);

    plugin.updateAnchorState({
      vesselPosition: vesselPosition,
      anchorPosition: anchorPosition,
      currentRadius: currentRadius,
      maxRadius: maxRadius,
      isSet: false,
    });

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
        if (plugin.lastAlarmSent + interval * 1000 < Date.now())
          do_update = true;

      //wait, do we have engines on?
      if (configuration.enableEngineCheck) {
        if (Utils.checkEngineState(app)) {
          app.debug("anchor alarm disabled due to engines on");
          do_update = true;
          new_state = "normal";
          message = "Engines on, alarm disabled.";

          plugin.raiseAnchor();

          app.setPluginStatus(message);
        }
      }
    }

    if (new_state !== plugin.alarm_state || do_update) {
      plugin.alarm_state = new_state;
      app.debug("alarm state change: %s -> %s", plugin.alarm_state, message);
      plugin.updateAnchorAlarm(plugin.alarm_state, message);

      if (plugin.alarm_state == "normal")
        app.setPluginStatus("Watching");
      else {
        plugin.lastAlarmSent = Date.now();
        app.setPluginError("Dragging");
      }
    }
  };

  // ============================================================
  // PUT / ACTION HANDLERS
  // ============================================================

  plugin.putRadius = function (context, path, value) {
    try {
      const radius = parseFloat(value);

      if (plugin.configuration.position) {
        // Emit the full anchor delta so navigation.anchor.meta.zones gets the
        // new threshold — pushing maxRadius alone leaves dragging detection
        // pinned to the old value.
        plugin.updateAnchorState({
          vesselPosition: app.getSelfPath("navigation.position.value"),
          anchorPosition: plugin.configuration.position,
          maxRadius: radius,
          isSet: false,
        });
      } else {
        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [{ path: "navigation.anchor.maxRadius", value: radius }],
            },
          ],
        });
      }

      plugin.configuration["radius"] = radius;
      if (plugin.configuration["position"]) {
        plugin.configuration["on"] = true;
        plugin.startWatchingPosition();
      }

      plugin.savePluginOptions();
      return { state: "SUCCESS" };
    } catch (err) {
      app.error(err);
      return { state: "FAILURE", message: err.message };
    }
  };

  plugin.putPosition = function (context, path, value) {
    try {
      if (value == null) {
        plugin.raiseAnchor();
      } else {
        plugin.updateAnchorState({
          anchorPosition: value,
          maxRadius: plugin.configuration["radius"],
          isSet: true,
        });

        plugin.configuration["position"] = {
          latitude: parseFloat(value.latitude),
          longitude: parseFloat(value.longitude),
        };

        plugin.configuration["radius"] = parseFloat(value.radius);
        if (plugin.configuration["radius"]) {
          plugin.configuration["on"] = true;
          plugin.startWatchingPosition();
        }

        plugin.savePluginOptions();
      }
      return { state: "SUCCESS" };
    } catch (err) {
      app.error(err);
      return { state: "FAILURE", message: err.message };
    }
  };

  // ============================================================
  // HTTP API ROUTES
  // ============================================================

  plugin.registerWithRouter = function (router) {
    router.post("/dropAnchor", (req, res) => {
      var position = req.body["position"];

      if (typeof position == "undefined") {
        app.debug("no position supplied");
        res.status(403);
        res.json({
          statusCode: 403,
          state: "FAILED",
          message: "no position supplied",
        });
      } else {
        app.debug(
          "set anchor position to: " +
          position.latitude +
          " " +
          position.longitude,
        );
        var radius = req.body["radius"];
        if (typeof radius == "undefined")
          radius = null;

        plugin.updateAnchorState({
          anchorPosition: position,
          currentRadius: 0,
          maxRadius: radius,
          isSet: true,
        });

        plugin.configuration["position"] = {
          latitude: parseFloat(position.latitude),
          longitude: parseFloat(position.longitude),
        };
        plugin.configuration["radius"] = parseFloat(radius);
        plugin.configuration["on"] = true;

        plugin.startWatchingPosition();

        try {
          plugin.savePluginOptions();
          res.json({
            statusCode: 200,
            state: "COMPLETED",
          });
        } catch (err) {
          app.error(err);
          res.status(500);
          res.json({
            statusCode: 500,
            state: "FAILED",
            message: "can't save config",
          });
        }
      }
    });

    router.post("/setRadius", (req, res) => {
      let position = app.getSelfPath("navigation.position");
      if (position.value)
        position = position.value;
      if (typeof position == "undefined") {
        app.debug("no position supplied");
        res.status(403);
        res.json({
          statusCode: 403,
          state: "FAILED",
          message: "no position supplied",
        });
      } else {
        var radius = req.body["radius"];
        if (typeof radius == "undefined") {
          app.debug("no radius supplied");
          res.status(403);
          res.json({
            statusCode: 403,
            state: "FAILED",
            message: "no radius supplied",
          });
          return;
        }

        app.debug("set anchor radius: " + radius);

        plugin.updateAnchorState({
          vesselPosition: position,
          anchorPosition: plugin.configuration.position,
          maxRadius: radius,
          isSet: false,
        });

        plugin.configuration["radius"] = parseFloat(radius);

        try {
          plugin.savePluginOptions();
          res.json({
            statusCode: 200,
            state: "COMPLETED",
          });
        } catch (err) {
          app.error(err);
          res.status(500);
          res.json({
            statusCode: 500,
            state: "FAILED",
            message: "can't save config",
          });
        }
      }
    });

    router.post("/raiseAnchor", (req, res) => {
      try {
        plugin.raiseAnchor();
        res.json({
          statusCode: 200,
          state: "COMPLETED",
        });
      } catch (err) {
        app.error(err);
        res.status(500);
        res.json({
          statusCode: 500,
          state: "FAILED",
          message: "can't save config",
        });
      }
    });
  };

  // ============================================================
  // PERSISTENCE
  // ============================================================

  plugin.savePluginOptions = function () {
    //app.debug('saving options..')
    app.savePluginOptions(plugin.configuration, (err) => {
      if (err) {
        app.error(err);
      }
    });
  };

  return plugin;
};
