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

import { watchZoneFromConfig } from "../shared/watch-zones/index.js";
import { readZoneConfig } from "./schema.js";

export class AnchorError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnchorError";
  }
}

export class ValidationError extends AnchorError {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export class StateError extends AnchorError {
  constructor(message) {
    super(message);
    this.name = "StateError";
  }
}

// Build a WatchZone from one of: a full zone config object, a legacy radius
// number, or the existing configuration on the plugin. Throws ValidationError
// when none of the inputs yield a usable zone.
function resolveZone({ zone, radius, plugin }) {
  if (zone != null) {
    if (typeof zone !== "object")
      throw new ValidationError("zone must be an object");
    try {
      return watchZoneFromConfig(zone);
    } catch (err) {
      throw new ValidationError(err.message);
    }
  }
  if (radius != null) {
    const parsed = parseFloat(radius);
    if (isNaN(parsed))
      throw new ValidationError("radius must be numeric");
    return watchZoneFromConfig({ type: "circle", radius: parsed });
  }
  const existing = readZoneConfig(plugin.configuration);
  if (existing) {
    return watchZoneFromConfig(existing);
  }
  throw new ValidationError("zone or radius required");
}

export function attach(app, plugin) {
  function drop({ position, zone, radius }) {
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

    const resolvedZone = resolveZone({ zone, radius, plugin });

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
  }

  function setZone(zone) {
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

    const resolvedZone = resolveZone({ zone, plugin });

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
  }

  // Legacy shim: treats `radius` as a circle zone and routes through setZone.
  function setRadius(radius) {
    if (radius == null) {
      throw new ValidationError("radius required");
    }
    const parsed = parseFloat(radius);
    if (isNaN(parsed)) {
      throw new ValidationError("radius must be numeric");
    }
    setZone({ type: "circle", radius: parsed });
  }

  function raise() {
    app.debug("raise anchor");

    plugin.updateAnchorState({ isSet: false });

    delete plugin.configuration.zone;
    plugin.savePluginOptions();

    plugin.stopWatchingPosition();
  }

  plugin.anchor = { drop, setZone, setRadius, raise };
}
