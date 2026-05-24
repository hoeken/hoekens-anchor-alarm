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

import { Watchdog } from "./watchdog.js";
import { metas, buildSchema, applyDefaults, migrateConfig, readZoneConfig } from "./schema.js";
import { watchZoneFromConfig } from "../shared/watch-zones/index.js";
import { SignalKBus } from "./signalk-bus.js";
import { attach as attachAnchorState } from "./anchor-state.js";
import { attach as attachPositionMonitor } from "./position-monitor.js";
import { attach as attachAnchorService } from "./anchor-service.js";
import { register as registerHttpRoutes } from "./http-routes.js";

export default function (app) {
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
    return buildSchema(app);
  };

  // ============================================================
  // MODULE WIRING
  // ============================================================

  attachAnchorState(app, plugin);
  attachPositionMonitor(app, plugin);
  attachAnchorService(app, plugin);

  // ============================================================
  // PUT / ACTION HANDLERS (legacy — HTTP routes are canonical)
  // ============================================================

  plugin.putPosition = function (context, path, value) {
    try {
      if (value == null) {
        plugin.anchor.raise();
      } else {
        plugin.anchor.drop({ position: value, radius: value.radius });
      }
      return { state: "SUCCESS" };
    } catch (err) {
      app.error(err);
      return { state: "FAILURE", message: err.message };
    }
  };

  plugin.putRadius = function (context, path, value) {
    try {
      plugin.anchor.setRadius(value);
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
    registerHttpRoutes(app, plugin, router);
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

    for (const [key, value] of Object.entries(metas))
      plugin.bus.queueMeta(key, value);

    plugin.configuration = props || {};
    // One-shot v2.1 -> v2.2 upgrade: legacy `radius` becomes a `zone` config.
    // Persist immediately so the next restart sees the migrated shape.
    const migrated = migrateConfig(plugin.configuration);
    plugin.configuration = applyDefaults(app, plugin.configuration);
    if (migrated) {
      app.debug("migrated legacy radius config to zone shape");
      plugin.savePluginOptions();
    }

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
      const zoneConfig = readZoneConfig(plugin.configuration);
      const anchorPosition = zoneConfig?.position;
      const zone = watchZoneFromConfig(zoneConfig);
      if (anchorPosition && zone) {
        plugin.updateAnchorState({
          anchorPosition: anchorPosition,
          zone: zone,
          isSet: true,
        });

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
}
