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

const metas = {
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
  "navigation.anchor.position": {
    description: "Anchor position, probably an estimate at best",
  },
  "navigation.anchor.state": { "description": "Anchor alarm state: 'on' or 'off'" },
};

const requiredPaths = [
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

function buildSchema(app) {
  const schemaData = {
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

  const pathChecks = {};
  for (const myPath of requiredPaths) {
    pathChecks[myPath.path] = {
      title: `${app.getSelfPath(myPath.path) ? "✅" : "❌"} ${myPath.path}`,
      description: app.getSelfPath(myPath.path) ? "" : myPath.description,
      type: "null",
      readOnly: true,
      default: null,
    };
  }
  schemaData.properties.pathChecks.properties = pathChecks;

  return schemaData;
}

module.exports = { metas, requiredPaths, buildSchema };
