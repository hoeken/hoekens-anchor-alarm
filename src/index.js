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

const Watchdog = require("./watchdog");
const Schema = require("./schema");
const SignalKBus = require("./signalk-bus");
const AnchorState = require("./anchor-state");
const PositionMonitor = require("./position-monitor");
const HttpRoutes = require("./http-routes");

module.exports = function (app) {
  const plugin = {};

  // ============================================================
  // PLUGIN IDENTITY & STATE
  // ============================================================

  plugin.id = "hoekens-anchor-alarm";
  plugin.name = "Hoeken's Anchor Alarm";
  plugin.description = "Anchor alarm with scope calculator, scribble tracks, engine override, and physically accurate icons.";

  plugin.subscriberPeriod = 1000;

  plugin.onStop = [];
  plugin.alarm_state = undefined;
  plugin.configuration = undefined;
  plugin.lastAlarmSent = 0;
  plugin.positionWatchdogTimer = false;

  plugin.bus = new SignalKBus(app, plugin.id);

  // ============================================================
  // CONFIGURATION SCHEMA
  // ============================================================

  plugin.schema = function () {
    return Schema.buildSchema(app);
  };

  // ============================================================
  // MODULE WIRING
  // ============================================================

  AnchorState.attach(app, plugin);
  PositionMonitor.attach(app, plugin);

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
    HttpRoutes.register(app, plugin, router);
  };

  // ============================================================
  // PERSISTENCE
  // ============================================================

  plugin.savePluginOptions = function () {
    app.savePluginOptions(plugin.configuration, (err) => {
      if (err) {
        app.error(err);
      }
    });
  };

  // ============================================================
  // PLUGIN LIFECYCLE
  // ============================================================

  plugin.start = function (props) {
    app.setPluginStatus("Started");

    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Started", ["visual"]);

    for (const [key, value] of Object.entries(Schema.metas))
      plugin.bus.queueMeta(key, value);

    plugin.configuration = props;
    try {
      //save our anchor roller height to the tree so we can access it from the web side
      if (typeof plugin.configuration["bowAnchorRollerHeight"] != "undefined")
        plugin.bus.queueDelta("design.bowAnchorRollerHeight", parseFloat(plugin.configuration["bowAnchorRollerHeight"]));

      //setup our watchdog timer
      const noPositionAlarmTime = plugin.configuration["noPositionAlarmTime"];
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
      const isOn = plugin.configuration["on"];
      const position = plugin.configuration["position"];
      const radius = plugin.configuration["radius"];
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

    plugin.bus.sendUpdates();
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

  return plugin;
};
