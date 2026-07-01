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

import { distance, point } from "@turf/turf";
import { Watchdog } from "./watchdog.js";
import { metas, buildSchema, applyDefaults, migrateConfig, readZoneConfig } from "./schema.js";
import { watchZoneFromConfig } from "../shared/watch-zones/index.js";
import { SignalKBus } from "./signalk-bus.js";
import { Utils } from "./utils.js";
import { register as registerHttpRoutes } from "./http-routes.js";
import { ValidationError, StateError } from "./errors.js";

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
  // PLUGIN LIFECYCLE
  // ============================================================

  plugin.start = function (props) {
    app.setPluginStatus("Started");

    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Started", ["visual"]);

    for (const [key, value] of Object.entries(metas))
      plugin.bus.queueMeta(key, value);

    plugin.configuration = props || {};
    // v2.1 -> v2.2 upgrade: legacy `radius` becomes a `zone` config.
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

      //save our total anchor chain length to the tree so we can access it from the web side
      if (typeof plugin.configuration["totalAnchorChainLength"] != "undefined")
        plugin.bus.queueDelta("design.totalAnchorChainLength", parseFloat(plugin.configuration["totalAnchorChainLength"]));

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

      //OLD APIs - only here for backwards compatibility
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
      plugin.updateAnchorAlarm(plugin.alarm_state, "Stopped", ["visual"]);
    }

    plugin.updateAnchorState({
      isSet: false,
    });

    plugin.stopWatchingPosition();

    app.setPluginStatus("Stopped");
  };

  // ============================================================
  // CONFIGURATION SCHEMA
  // ============================================================

  plugin.schema = function () {
    return buildSchema(app);
  };

  // ============================================================
  // ANCHOR STATE (SignalK delta emission)
  // ============================================================

  plugin.updateAnchorAlarm = function (state, message, method) {
    if (!message)
      message = state.charAt(0).toUpperCase() + state.slice(1);

    if (!method)
      method = ["visual", "sound"];

    plugin.bus.queueDelta("notifications.navigation.anchor", {
      state: state,
      method: method,
      message: message,
    });

    plugin.bus.sendUpdates();
  };

  plugin.updateAnchorState = function (params) {
    if (params.isSet) {
      plugin.bus.queueDelta("navigation.anchor.state", "on");

      if (params.anchorPosition) {
        const anchorPosition = {
          latitude: parseFloat(params.anchorPosition.latitude),
          longitude: parseFloat(params.anchorPosition.longitude),
        };

        plugin.bus.queueDelta("navigation.anchor.position", anchorPosition);
      }

      if (params.currentRadius != null) {
        plugin.bus.queueDelta(
          "navigation.anchor.currentRadius",
          parseFloat(params.currentRadius),
        );
      }

      if (params.zone) {
        plugin.bus.queueDelta("navigation.anchor.watchZone", params.zone.getConfig());

        // Keep maxRadius (and the legacy zones meta array) populated for
        // circle shapes so external consumers like Freeboard keep working.
        // Non-circle shapes clear maxRadius — the watchZone path is the
        // canonical source of truth.
        const circleRadius = params.zone.getCircleRadius();
        if (circleRadius != null) {
          plugin.bus.queueDelta("navigation.anchor.maxRadius", circleRadius);
          const zones = [
            {
              state: "normal",
              lower: 0,
              upper: circleRadius,
            },
            {
              state: plugin.configuration.state,
              lower: circleRadius,
            },
          ];
          plugin.bus.queueDelta("navigation.anchor.meta", { zones: zones });
        } else {
          plugin.bus.queueDelta("navigation.anchor.maxRadius", null);
        }
      }
    } else {
      plugin.bus.queueDelta("navigation.anchor.position", null);
      plugin.bus.queueDelta("navigation.anchor.state", "off");
      plugin.bus.queueDelta("navigation.anchor.currentRadius", null);
      plugin.bus.queueDelta("navigation.anchor.maxRadius", null);
      plugin.bus.queueDelta("navigation.anchor.watchZone", null);
    }

    plugin.bus.sendUpdates();
  };

  // ============================================================
  // POSITION MONITORING
  // ============================================================

  plugin.startWatchingPosition = function () {
    if (plugin.onStop.length > 0)
      return;

    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Watching", ["visual"]);

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
      plugin.handlePositionUpdate,
    );
  };

  plugin.handlePositionUpdate = function (delta) {
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
      plugin.checkPosition(vesselPosition);
    }
  };

  plugin.stopWatchingPosition = function () {
    plugin.alarm_state = "normal";
    plugin.updateAnchorAlarm(plugin.alarm_state, "Off", ["visual"]);

    if (plugin.positionWatchdogTimer)
      plugin.positionWatchdogTimer.stop();

    app.setPluginStatus("Off");

    plugin.onStop.forEach((f) => f());
    plugin.onStop = [];
  };

  plugin.checkPosition = function (vesselPosition) {
    const configuration = plugin.configuration;
    const zoneConfig = readZoneConfig(configuration);
    const anchorPosition = zoneConfig?.position;
    const zone = watchZoneFromConfig(zoneConfig);

    // currentRadius keeps its v2.1 semantics — straight-line distance from
    // anchor to GPS. Even with non-circle zones it's a useful display value
    // and downstream SignalK consumers (logging, telemetry) still rely on it.
    const currentRadius = distance(
      point([vesselPosition.longitude, vesselPosition.latitude]),
      point([anchorPosition.longitude, anchorPosition.latitude]),
      { units: "meters" },
    );

    //update our parameter that may change.
    plugin.updateAnchorState({
      currentRadius: currentRadius,
      isSet: true,
    });

    let new_state = "normal";
    let do_update = false;
    let message = "Watching";

    const outside = !zone.contains(vesselPosition, anchorPosition);
    if (outside) {
      //okay, we're dragging.
      new_state = configuration.state;
      message = `Anchor Dragging (${Math.round(currentRadius)}m)`;

      //how often should we send it?
      const interval = configuration["anchorAlarmInterval"];
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
  // ANCHOR SERVICE
  // ============================================================

  // Build a WatchZone from a full zone config object. Throws ValidationError
  // when none of the inputs yield a usable zone.
  plugin.resolveZone = function (zone) {
    if (zone != null) {
      if (typeof zone !== "object")
        throw new ValidationError("zone must be an object");
      try {
        return watchZoneFromConfig(zone);
      } catch (err) {
        throw new ValidationError(err.message);
      }
    }

    const existing = readZoneConfig(plugin.configuration);
    if (existing) {
      return watchZoneFromConfig(existing);
    }

    throw new ValidationError("zone required");
  };

  plugin.dropAnchor = function ({ position, zone }) {
    if (
      !position ||
      position.latitude == null ||
      position.longitude == null
    ) {
      throw new ValidationError("position with latitude and longitude required");
    }

    const parsedPosition = {
      latitude: parseFloat(position.latitude),
      longitude: parseFloat(position.longitude),
    };
    if (isNaN(parsedPosition.latitude) || isNaN(parsedPosition.longitude)) {
      throw new ValidationError("position latitude and longitude must be numeric");
    }

    const resolvedZone = plugin.resolveZone(zone);

    // Refuse a drop that leaves the boat outside the zone — it would trip the
    // drag alarm immediately. Skip the guard when we have no GPS fix, or when
    // allowZoneOutsideVessel is enabled for alarm testing.
    const vesselPosition = app.getSelfPath("navigation.position.value");
    if (
      !plugin.configuration.allowZoneOutsideVessel &&
      vesselPosition &&
      !resolvedZone.contains(vesselPosition, parsedPosition)
    ) {
      throw new StateError(
        "boat is outside the watch zone — alarm would trigger immediately",
      );
    }

    app.debug(
      "drop anchor at: " +
      parsedPosition.latitude +
      " " +
      parsedPosition.longitude,
    );

    plugin.updateAnchorState({
      anchorPosition: parsedPosition,
      currentRadius: 0,
      zone: resolvedZone,
      isSet: true,
    });

    plugin.configuration.zone = JSON.stringify({
      ...resolvedZone.getConfig(),
      position: parsedPosition,
    });

    plugin.startWatchingPosition();
    plugin.savePluginOptions();
  };

  plugin.setZone = function (zone) {
    if (zone == null) {
      throw new ValidationError("zone required");
    }

    const existingZoneConfig = readZoneConfig(plugin.configuration);
    const anchorPosition = existingZoneConfig?.position;
    if (!anchorPosition) {
      throw new StateError("no anchor is currently dropped");
    }

    const vesselPosition = app.getSelfPath("navigation.position.value");
    if (!vesselPosition) {
      throw new StateError("no GPS position available");
    }

    const resolvedZone = plugin.resolveZone(zone);

    // Refuse a zone that no longer contains the boat — saving it would trip the
    // drag alarm immediately. Skip the guard when allowZoneOutsideVessel is
    // enabled for alarm testing.
    if (
      !plugin.configuration.allowZoneOutsideVessel &&
      !resolvedZone.contains(vesselPosition, anchorPosition)
    ) {
      throw new StateError(
        "boat is outside the watch zone — alarm would trigger immediately",
      );
    }

    app.debug("set anchor zone: " + JSON.stringify(resolvedZone.getConfig()));

    plugin.updateAnchorState({
      zone: resolvedZone,
      isSet: true,
    });

    plugin.configuration.zone = JSON.stringify({
      ...resolvedZone.getConfig(),
      position: anchorPosition,
    });
    plugin.savePluginOptions();
  };

  // Legacy shim: treats `radius` as a circle zone and routes through setZone.
  plugin.setRadius = function (radius) {
    if (radius == null) {
      throw new ValidationError("radius required");
    }
    const parsed = parseFloat(radius);
    if (isNaN(parsed)) {
      throw new ValidationError("radius must be numeric");
    }
    plugin.setZone({ type: "circle", radius: parsed });
  };

  plugin.raiseAnchor = function () {
    app.debug("raise anchor");

    plugin.updateAnchorState({ isSet: false });

    delete plugin.configuration.zone;
    plugin.savePluginOptions();

    plugin.stopWatchingPosition();
  };

  // ============================================================
  // PUT / ACTION HANDLERS (legacy — HTTP routes are canonical)
  // ============================================================

  plugin.putPosition = function (context, path, value) {
    try {
      if (value == null) {
        plugin.raiseAnchor();
      } else {
        plugin.dropAnchor({ position: value, zone: { type: "circle", radius: value.radius } });
      }
      return { state: "SUCCESS" };
    } catch (err) {
      app.error(err);
      return { state: "FAILURE", message: err.message };
    }
  };

  plugin.putRadius = function (context, path, value) {
    try {
      plugin.setRadius(value);
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

  return plugin;
}
