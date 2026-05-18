// AIS ship-type code → icon filename (under icons/ships/png/).
// Code 36 (sailing) is handled separately to switch on hull aspect ratio.
// Codes 0, 1-19, 38, 39, 56, 57 are unmapped and fall through to default.png.

const RANGES = [
  { start: 20, end: 29, icon: "wing-in-ground.png" }, // Wing in ground (WIG)
  { start: 30, end: 30, icon: "fishing.png" },
  { start: 31, end: 32, icon: "towing.png" },
  { start: 33, end: 33, icon: "dredging.png" },
  { start: 34, end: 34, icon: "diving.png" },
  { start: 35, end: 35, icon: "military.png" },
  { start: 37, end: 37, icon: "pleasure.png" },
  { start: 40, end: 49, icon: "high-speed-craft.png" }, // High speed craft (HSC)
  { start: 50, end: 50, icon: "pilot.png" },
  { start: 51, end: 51, icon: "sar.png" },
  { start: 52, end: 52, icon: "tug.png" },
  { start: 53, end: 53, icon: "port-tender.png" },
  { start: 54, end: 54, icon: "anti-pollution.png" },
  { start: 55, end: 55, icon: "police.png" },
  { start: 58, end: 58, icon: "medical.png" },
  { start: 59, end: 59, icon: "noncombatant.png" },
  { start: 60, end: 69, icon: "passenger.png" },
  { start: 70, end: 79, icon: "cargo.png" },
  { start: 80, end: 89, icon: "tanker.png" },
  { start: 90, end: 99, icon: "other.png" },
];

export class ShipIcons {
  static iconFor(aisShipType, aspectRatio) {
    aisShipType = parseInt(aisShipType, 10);

    // Sailing: pick monohull vs catamaran by hull aspect ratio.
    if (aisShipType === 36)
      return aspectRatio >= 2.5
        ? "icons/ships/png/sailboat.png"
        : "icons/ships/png/catamaran.png";

    const range = RANGES.find(
      (r) => aisShipType >= r.start && aisShipType <= r.end,
    );

    return range
      ? `icons/ships/png/${range.icon}`
      : "icons/ships/png/default.png";
  }
}
