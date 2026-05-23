import { CircleZone } from "./CircleZone.js";

export { WatchZone } from "./WatchZone.js";
export { CircleZone } from "./CircleZone.js";

export const SUPPORTED_ZONE_TYPES = ["circle"];

// Single dispatch point. Unknown/missing types fall back to a default circle
// so a malformed config can't take the plugin offline.
export function watchZoneFromConfig(config) {
  const type = config && typeof config === "object" ? config.type : undefined;
  switch (type) {
    case "circle":
    case undefined:
    case null:
      return new CircleZone(config || {});
    default:
      throw new Error(`Unknown watch zone type: ${type}`);
  }
}
