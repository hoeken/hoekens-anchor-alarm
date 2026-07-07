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

import { ValidationError } from "./errors.js";

export const metas = {
  "design.bowAnchorRollerHeight": {
    units: "m",
    displayUnits: {
      category: "length",
    },
    description: "Height of the bow anchor roller above the water",
  },
  "design.totalAnchorChainLength": {
    units: "m",
    displayUnits: {
      category: "length",
    },
    description: "Total length of the anchor chain/rode available",
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
  "navigation.anchor.distanceFromBow": {
    units: "m",
    displayUnits: {
      category: "length",
    },
    description: "Distance from the bow to the anchor",
  },
  "navigation.anchor.bearingTrue": {
    units: "rad",
    displayUnits: {
      category: "angle",
    },
    description: "The true bearing from the bow to the anchor",
  },
  "navigation.anchor.apparentBearing": {
    units: "rad",
    displayUnits: {
      category: "angle",
    },
    description: "The apparent bearing from the bow to the anchor, relative to the vessel heading",
  },
  "navigation.anchor.position": {
    description: "Anchor position, probably an estimate at best",
  },
  "navigation.anchor.state": { "description": "Anchor alarm state: 'on' or 'off'" },
  "navigation.anchor.watchZone": {
    description: "Anchor watch zone configuration (shape + parameters). Anchor position is stored separately on navigation.anchor.position.",
  },
};

export const requiredPaths = [
  {
    path: "navigation.position",
    description: "Required - you need a GPS position of some sort to watch.",
  },
  {
    path: "navigation.headingTrue",
    description: "Optional - used for map-accurate heading. Provided by plugin derived-data",
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
    path: "environment.depth.belowKeel",
    description:
      "Optional - used for minimum depth calculations. Provided by plugin derived-data or N2K",
  },
  {
    path: "environment.wind.directionTrue",
    description:
      "Optional - used for wind barb display",
  },
  {
    path: "environment.wind.speedApparent",
    description:
      "Optional - used for wind barb display",
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

export function buildSchema(app) {
  const schemaData = {
    title: "Hoeken's Anchor Alarm",
    type: "object",
    properties: {
      pathChecks: {
        title: "Path Checks",
        type: "object",
        properties: {},
      },
      defaultBasemap: {
        type: "string",
        title: "Default Basemap",
        description:
          "Which map layer to show on load; all remain switchable at runtime via the layer control. \"Blank\" draws no tiles — useful offline, on slow links, or when relying only on local charts.",
        default: "Satellite",
        enum: ["Blank", "OpenStreetMap", "Satellite"],
      },
      defaultShape: {
        type: "string",
        title: "Default Watch Zone Shape",
        description:
          "Shape used when estimating a new anchor position before it is dropped.",
        default: "circle",
        enum: ["circle", "sector", "polygon"],
      },
      fleetFilterRadius: {
        type: "integer",
        title: "Fleet Filter Radius (m)",
        description:
          "Radius around own vessel to display other vessels and historical tracks.",
        default: 100000,
      },
      enableTidePanel: {
        type: "boolean",
        title: "Show Tide Box",
        description:
          "Show the tide chart panel while anchored (requires signalk-tides).",
        default: true,
      },
      enableWindPanel: {
        type: "boolean",
        title: "Show Wind Box",
        description:
          "Show the wind speed/direction panel while anchored.",
        default: true,
      },
      enableScopePanel: {
        type: "boolean",
        title: "Show Scope Box",
        description:
          "Show the scope/depth calculator panel while the anchor is up.",
        default: true,
      },
      enableBoatLabels: {
        type: "boolean",
        title: "Show Boat Name Labels",
        description:
          "Show other vessels' names as labels on the map (only once zoomed in enough to be legible).",
        default: true,
      },
      enableChartLayers: {
        type: "boolean",
        title: "Use Chart Layers if Available",
        description:
          "When local raster charts are available (via a charts plugin), enable them as map overlays by default. Turn off to keep them in the layer control but off until toggled on manually.",
        default: true,
      },
      enableSeascape: {
        type: "boolean",
        title: "Use Seascape Bathymetry",
        description:
          "Overlay the Seascape bathymetry (water depth) chart on top of the base map by default. Needs an internet connection and a WebGL-capable browser; where either is missing the base map shows unchanged. Also toggleable at runtime in the layer control.",
        default: false,
      },
      scopes: {
        type: "string",
        title: "Scope Ratios",
        description:
          "Comma-separated scope ratios (1–10) to calculate and display, e.g. \"7,5,4,3\". Invalid entries are ignored. Leave the field blank to turn off the scope calculations entirely. Also editable live from the web UI.",
        default: "7,5,4,3",
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
      allowZoneOutsideVessel: {
        type: "boolean",
        title: "Allow Watch Zone Outside Vessel Position",
        description:
          "Allow setting the anchor watch zone outside of the vessel's position. Useful for testing the alarm - normally a drop or zone that would trip the drag alarm immediately is refused.",
        default: false,
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
      totalAnchorChainLength: {
        type: "number",
        title:
          "Total length of the anchor chain/rode (in meters).  Used to flag scopes longer than your available chain.",
        default: 100,
      },
      zone: {
        type: "string",
        title: "Anchor Watch Zone (JSON)",
        description: "Watch zone shape + parameters + anchor position as a single JSON string. ⚠️ Do not edit by hand — use the web UI. Blank when no anchor is dropped. Example: {\"type\":\"circle\",\"radius\":60,\"position\":{\"latitude\":0,\"longitude\":0}}.",
        default: "",
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

// Plugin config keys the web UI is allowed to read and write through
// /ui-config. This is the whitelist of *which* keys are exposed; their types,
// enums, and defaults all come from buildSchema above, so there's one source
// of truth. Anchor state (`zone`) and alarm internals are deliberately
// excluded — those are owned by the anchor service, not the settings form.
export const UI_CONFIG_KEYS = [
  "defaultBasemap",
  "defaultShape",
  "fleetFilterRadius",
  "enableTidePanel",
  "enableWindPanel",
  "enableScopePanel",
  "enableBoatLabels",
  "enableChartLayers",
  "enableSeascape",
  "scopes",
];

// Project the UI-relevant subset out of a full plugin config (the /ui-config
// GET response shape).
export function pickUiConfig(config = {}) {
  const out = {};
  for (const key of UI_CONFIG_KEYS)
    out[key] = config[key];
  return out;
}

// Coerce/validate one value against its JSON Schema property. Mirrors how
// SignalK's admin form treats the same schema. Throws ValidationError (→ 403)
// on anything that doesn't fit.
function coerceToSchema(key, prop, value) {
  if (!prop)
    throw new ValidationError(`unknown config field: ${key}`);

  if (Array.isArray(prop.enum) && !prop.enum.includes(value))
    throw new ValidationError(`${key} must be one of: ${prop.enum.join(", ")}`);

  switch (prop.type) {
    case "string":
      if (typeof value !== "string")
        throw new ValidationError(`${key} must be a string`);
      return value;
    case "integer":
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n))
        throw new ValidationError(`${key} must be a number`);
      return prop.type === "integer" ? Math.round(n) : n;
    }
    case "boolean":
      return Boolean(value);
    default:
      throw new ValidationError(`unsupported schema type for ${key}`);
  }
}

// Validate an incoming /ui-config POST body against the plugin schema,
// returning the coerced updates — only whitelisted keys that were present.
export function coerceUiConfig(app, body = {}) {
  const props = buildSchema(app).properties;
  const updates = {};
  for (const key of UI_CONFIG_KEYS) {
    if (body[key] === undefined)
      continue;
    updates[key] = coerceToSchema(key, props[key], body[key]);
  }
  return updates;
}

// Mutates config in place, filling in top-level schema defaults for any keys
// the user hasn't explicitly saved. SignalK does not materialize schema
// defaults into the saved options blob, so downstream code (and the
// /ui-config endpoint) would otherwise see undefined for unset properties.
export function applyDefaults(app, config) {
  const schema = buildSchema(app);
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (config[key] === undefined && prop.default !== undefined) {
      // Clone object/array defaults so mutating the live config doesn't
      // poison the schema for the next call.
      config[key] = typeof prop.default === "object" && prop.default !== null
        ? structuredClone(prop.default)
        : prop.default;
    }
  }
  return config;
}

// Upgrade older config shapes to the current v2.2 shape: a single `zone`
// JSON string holding shape + parameters + anchor position. Returns true when
// the config was actually mutated so callers can persist the result.
// Idempotent.
export function migrateConfig(config) {
  let mutated = false;

  // v2.1 legacy: top-level radius becomes a circle zone JSON string.
  if (typeof config.zone !== "string" || config.zone.length === 0) {
    const radius = Number(config.radius);
    if (Number.isFinite(radius) && radius > 0) {
      config.zone = JSON.stringify({ type: "circle", radius });
      delete config.radius;
      mutated = true;
    }
  }

  return mutated;
}

// Parse the persisted zone JSON, returning null when the field is missing or
// malformed. Callers that need a usable zone should fall back to
// watchZoneFromConfig(null) which yields a default circle.
export function readZoneConfig(config) {
  if (typeof config.zone !== "string" || config.zone.length === 0)
    return null;
  try {
    return JSON.parse(config.zone);
  } catch {
    return null;
  }
}
