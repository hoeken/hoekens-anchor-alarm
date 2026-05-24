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

import { Utils } from "./utils.js";
import { watchZoneFromConfig } from "../shared/watch-zones/index.js";
import { readZoneConfig } from "./schema.js";

export function attach(app, plugin) {
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
          plugin.checkPosition(vesselPosition);
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

  plugin.checkPosition = function (vesselPosition) {
    const configuration = plugin.configuration;
    const zoneConfig = readZoneConfig(configuration);
    const anchorPosition = zoneConfig?.position;
    const zone = watchZoneFromConfig(zoneConfig);

    // currentRadius keeps its v2.1 semantics — straight-line distance from
    // anchor to GPS. Even with non-circle zones it's a useful display value
    // and downstream SignalK consumers (logging, telemetry) still rely on it.
    const currentRadius = Utils.calc_distance(
      vesselPosition.latitude,
      vesselPosition.longitude,
      anchorPosition.latitude,
      anchorPosition.longitude,
    );

    plugin.updateAnchorState({
      vesselPosition: vesselPosition,
      anchorPosition: anchorPosition,
      currentRadius: currentRadius,
      zone: zone,
      isSet: false,
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

          plugin.anchor.raise();

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
}
