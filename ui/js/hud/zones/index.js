// Dispatch table for watch-zone UI. Each entry pairs a zone type with its
// Leaflet overlay class and its DOM controls class. Adding a new shape
// (polygon, …) means writing those two classes and registering them here.

import { CircleZoneOverlay } from "./CircleZoneOverlay.js";
import { CircleZoneControls } from "./CircleZoneControls.js";
import { SectorZoneOverlay } from "./SectorZoneOverlay.js";
import { SectorZoneControls } from "./SectorZoneControls.js";
import { PolygonZoneOverlay } from "./PolygonZoneOverlay.js";
import { PolygonZoneControls } from "./PolygonZoneControls.js";

const REGISTRY = {
  circle: {
    label: "Circle",
    overlay: CircleZoneOverlay,
    controls: CircleZoneControls,
    enabled: true,
  },
  sector: {
    label: "Sector",
    overlay: SectorZoneOverlay,
    controls: SectorZoneControls,
    enabled: true,
  },
  polygon: {
    label: "Polygon",
    overlay: PolygonZoneOverlay,
    controls: PolygonZoneControls,
    enabled: true,
  },
};

export const SUPPORTED_ZONE_TYPES = Object.entries(REGISTRY)
  .filter(([, entry]) => entry.enabled)
  .map(([type]) => type);

export function getZoneTypeOptions() {
  return Object.entries(REGISTRY).map(([type, entry]) => ({
    type,
    label: entry.label,
    enabled: entry.enabled,
  }));
}

export function createZoneOverlay(zone, { map, anchorPosition, onChange, onInput }) {
  const type = zone.getType();
  const entry = REGISTRY[type];
  if (!entry || !entry.overlay)
    throw new Error(`No overlay registered for zone type: ${type}`);
  return new entry.overlay({ map, anchorPosition, zone, onChange, onInput });
}

export function createZoneControls(type, { parent, onChange }) {
  const entry = REGISTRY[type];
  if (!entry || !entry.controls)
    throw new Error(`No controls registered for zone type: ${type}`);
  return new entry.controls({ parent, onChange });
}

// Build a default zone config when the user picks a new shape. Radius is
// resolved here once (current zone radius → estimated radius → 60m fallback)
// and handed to the per-shape static so each shape only deals with what it
// actually needs.
export function createDefaultZoneConfig(type, appState) {
  const entry = REGISTRY[type];
  if (!entry || !entry.overlay?.defaultConfig)
    return { type };

  const currentRadius = Number(appState?.anchor?.watchZone?.value?.radius);
  const estimatedRadius = Number(appState?.getAnchorEstimate?.()?.radius);
  let radius;
  if (Number.isFinite(currentRadius) && currentRadius > 0)
    radius = currentRadius;
  else if (Number.isFinite(estimatedRadius) && estimatedRadius > 0)
    radius = estimatedRadius;
  else
    radius = 60;

  return entry.overlay.defaultConfig({ appState, radius });
}
