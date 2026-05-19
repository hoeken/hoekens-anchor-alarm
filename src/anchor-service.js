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

class AnchorError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnchorError";
  }
}

class ValidationError extends AnchorError {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

class StateError extends AnchorError {
  constructor(message) {
    super(message);
    this.name = "StateError";
  }
}

function attach(app, plugin) {
  function drop({ position, radius }) {
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

    const parsedRadius = radius == null ? null : parseFloat(radius);
    if (parsedRadius != null && isNaN(parsedRadius)) {
      throw new ValidationError("radius must be numeric");
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
      maxRadius: parsedRadius,
      isSet: true,
    });

    plugin.configuration.position = parsedPosition;
    plugin.configuration.radius = parsedRadius;
    plugin.configuration.on = true;

    plugin.startWatchingPosition();
    plugin.savePluginOptions();
  }

  function setRadius(radius) {
    if (radius == null) {
      throw new ValidationError("radius required");
    }
    const parsedRadius = parseFloat(radius);
    if (isNaN(parsedRadius)) {
      throw new ValidationError("radius must be numeric");
    }

    if (!plugin.configuration.position) {
      throw new StateError("no anchor is currently dropped");
    }

    const vesselPosition = app.getSelfPath("navigation.position.value");
    if (!vesselPosition) {
      throw new StateError("no GPS position available");
    }

    app.debug("set anchor radius: " + parsedRadius);

    plugin.updateAnchorState({
      vesselPosition: vesselPosition,
      anchorPosition: plugin.configuration.position,
      maxRadius: parsedRadius,
      isSet: false,
    });

    plugin.configuration.radius = parsedRadius;
    plugin.savePluginOptions();
  }

  function raise() {
    app.debug("raise anchor");

    plugin.updateAnchorState({ isSet: false });

    delete plugin.configuration.position;
    delete plugin.configuration.radius;
    plugin.configuration.on = false;

    plugin.stopWatchingPosition();
    plugin.savePluginOptions();
  }

  plugin.anchor = { drop, setRadius, raise };
}

module.exports = { attach, AnchorError, ValidationError, StateError };
