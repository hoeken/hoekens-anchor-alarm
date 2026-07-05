// BoatConfig is an immutable value object describing a vessel's geometry and
// identity: LOA, beam, GPS antenna offsets, anchor roller height, AIS ship
// type, and MMSI. The same shape covers our own boat (fromSelf, parsed from
// /self) and AIS-detected vessels (fromVessel, parsed from a /vessels record
// with permissive defaults for the often-missing fields).

import { SignalKHelper } from "./SignalKHelper.js";
import { ShipIcons } from "./ShipIcons.js";

const DEFAULTS = {
  name: "Unknown",
  loa: 14,
  beam: 4,
  anchorRollerHeight: 0,
  totalAnchorChainLength: 100,
  gpsBowXDistance: 0,
  gpsBowYDistance: 0,
  aisShipType: 36,
  mmsi: "",
  heading: 0,
  cog: null,
  sog: null,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Returns value only when it's a positive, finite number; otherwise fallback.
// Used for beam/loa, which must be nonzero: they're divisors for icon scaling
// and the extents the GPS offsets get clamped to.
const positiveOr = (value, fallback) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

// Class B AIS transponders are the recreational tier; SOLAS carriage rules put
// vessels 24m and over onto Class A. So a sailing (36) or pleasure (37) craft
// broadcasting Class B with an LOA past this threshold is almost certainly a
// misconfigured transponder (a common failure mode is a garbage or leftover
// dimension field). Left alone those bogus dimensions draw an absurdly large
// hull and anchor overlay that can dominate the map, so we discard them and
// fall back to defaults.
const CLASS_B_MISCONFIG_LOA_M = 24;
const CLASS_B_RECREATIONAL_TYPES = [36, 37];

const isMisconfiguredClassB = (data, aisShipType, loa) =>
  SignalKHelper.value(data, "sensors.ais.class") === "B" &&
  CLASS_B_RECREATIONAL_TYPES.includes(Number(aisShipType)) &&
  loa > CLASS_B_MISCONFIG_LOA_M;

export class BoatConfig {
  constructor({
    name,
    loa,
    beam,
    anchorRollerHeight,
    totalAnchorChainLength,
    gpsBowXDistance,
    gpsBowYDistance,
    aisShipType,
    mmsi,
    heading,
    cog,
    sog,
  }) {
    this.name = name;
    this.loa = loa;
    this.beam = beam;
    this.anchorRollerHeight = anchorRollerHeight;
    this.totalAnchorChainLength = totalAnchorChainLength;
    this.gpsBowXDistance = gpsBowXDistance;
    this.gpsBowYDistance = gpsBowYDistance;
    this.aisShipType = aisShipType;
    this.mmsi = mmsi;
    this.heading = heading;
    this.cog = cog;
    this.sog = sog;
  }

  static extract(data) {
    let config = {};

    config.name = data.name ?? DEFAULTS.name;
    config.mmsi = data.mmsi ?? DEFAULTS.mmsi;

    config.loa = positiveOr(
      SignalKHelper.value(data, "design.length")?.overall,
      DEFAULTS.loa,
    );
    config.beam = positiveOr(
      SignalKHelper.value(data, "design.beam"),
      DEFAULTS.beam,
    );

    config.aisShipType =
      SignalKHelper.value(data, "design.aisShipType")?.id ??
      DEFAULTS.aisShipType;

    // Sanitize misconfigured Class B dimensions (see the constants above)
    // before loa/beam feed the GPS-offset defaults and clamps below, the icon
    // scaling, and the drawn hull.
    if (isMisconfiguredClassB(data, config.aisShipType, config.loa)) {
      config.loa = DEFAULTS.loa;
      config.beam = DEFAULTS.beam;
    }

    config.anchorRollerHeight =
      SignalKHelper.value(data, "design.bowAnchorRollerHeight") ??
      DEFAULTS.anchorRollerHeight;
    config.totalAnchorChainLength =
      SignalKHelper.value(data, "design.totalAnchorChainLength") ||
      DEFAULTS.totalAnchorChainLength;
    if (data.sensors?.gps) {
      config.gpsBowXDistance =
        SignalKHelper.value(data, "sensors.gps.fromCenter") ??
        DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance =
        SignalKHelper.value(data, "sensors.gps.fromBow") ??
        DEFAULTS.gpsBowYDistance;
    } else if (data.sensors?.ais) {
      config.gpsBowXDistance =
        SignalKHelper.value(data, "sensors.ais.fromCenter") ??
        DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance =
        SignalKHelper.value(data, "sensors.ais.fromBow") ?? config.loa / 2;
    } else {
      config.gpsBowXDistance = DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance = DEFAULTS.gpsBowYDistance;
    }

    // Clamp the GPS antenna offsets to the hull so a bad or stale Signal K
    // value can't place the antenna off the boat when we draw the icon and
    // anchor overlay. Done after beam/loa are resolved to positive values
    // above: X (from centerline) can't sit wider than half the beam, and Y
    // (aft of the bow) must fall between the bow (0) and the stern (loa).
    const halfBeam = config.beam / 2;
    config.gpsBowXDistance = clamp(config.gpsBowXDistance, -halfBeam, halfBeam);
    config.gpsBowYDistance = clamp(config.gpsBowYDistance, 0, config.loa);

    // Stored in Signal K base units (sog: m/s, cog: rad true). DisplayUnit
    // handles conversion + formatting (speed → kn, angle → °) at render time.
    config.sog =
      SignalKHelper.value(data, "navigation.speedOverGround") ?? DEFAULTS.sog;
    config.cog =
      SignalKHelper.value(data, "navigation.courseOverGroundTrue") ??
      DEFAULTS.cog;

    return new BoatConfig(config);
  }

  // BoatMarker takes x-offset from the left edge of the hull, not center.
  get bowOffset() {
    return {
      x: this.beam / 2 + this.gpsBowXDistance,
      y: this.gpsBowYDistance,
    };
  }

  // Center-relative GPS offset, for GeoMath / AnchorOverlay consumers.
  get gpsOffset() {
    return { x: this.gpsBowXDistance, y: this.gpsBowYDistance };
  }

  get loaToBeam() {
    return this.loa / this.beam;
  }

  get icon() {
    return ShipIcons.iconFor(this.aisShipType, this.loaToBeam);
  }
}
