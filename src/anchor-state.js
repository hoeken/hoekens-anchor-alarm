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

export function attach(app, plugin) {
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
}
