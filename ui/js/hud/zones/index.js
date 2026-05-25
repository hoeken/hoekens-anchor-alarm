// Dispatch table for watch-zone UI. Each entry pairs a zone type with its
// Leaflet overlay class and its DOM controls class. Adding a new shape (sector,
// polygon, …) means writing those two classes and registering them here.

import { CircleZoneOverlay } from "./CircleZoneOverlay.js";
import { CircleZoneControls } from "./CircleZoneControls.js";

const REGISTRY = {
  circle: {
    label: "Circle",
    overlay: CircleZoneOverlay,
    controls: CircleZoneControls,
    enabled: true,
  },
  // Sector and polygon land in a follow-up PR. Listed here (disabled) so the
  // shape dropdown can advertise them as coming-soon.
  sector: { label: "Sector", overlay: null, controls: null, enabled: false },
  polygon: { label: "Polygon", overlay: null, controls: null, enabled: false },
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
