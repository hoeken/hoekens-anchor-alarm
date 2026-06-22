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

    config.loa =
      SignalKHelper.value(data, "design.length")?.overall || DEFAULTS.loa;
    config.beam = SignalKHelper.value(data, "design.beam") || DEFAULTS.beam;
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
    config.aisShipType =
      SignalKHelper.value(data, "design.aisShipType")?.id ??
      DEFAULTS.aisShipType;

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
