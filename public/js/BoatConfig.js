// BoatConfig is an immutable value object describing a vessel's geometry and
// identity: LOA, beam, GPS antenna offsets, anchor roller height, AIS ship
// type, and MMSI. The same shape covers our own boat (fromSelf, parsed from
// /self) and AIS-detected vessels (fromVessel, parsed from a /vessels record
// with permissive defaults for the often-missing fields).

import { SignalKClient } from "./SignalKClient.js";
import { ShipIcons } from "./ShipIcons.js";

const DEFAULTS = {
  loa: 14,
  beam: 4,
  anchorRollerHeight: 0,
  gpsBowXDistance: 0,
  gpsBowYDistance: 0,
  aisShipType: 36,
  mmsi: "",
  heading: 0,
};

export class BoatConfig {
  constructor({
    loa,
    beam,
    anchorRollerHeight,
    gpsBowXDistance,
    gpsBowYDistance,
    aisShipType,
    mmsi,
    heading,
  }) {
    this.loa = loa;
    this.beam = beam;
    this.anchorRollerHeight = anchorRollerHeight;
    this.gpsBowXDistance = gpsBowXDistance;
    this.gpsBowYDistance = gpsBowYDistance;
    this.aisShipType = aisShipType;
    this.mmsi = mmsi;
    this.heading = heading;
  }

  static extract(data) {
    let config = {};
    config.loa =
      SignalKClient.value(data, "design.length")?.overall ?? DEFAULTS.loa;
    config.beam = SignalKClient.value(data, "design.beam") ?? DEFAULTS.beam;
    config.anchorRollerHeight =
      SignalKClient.value(data, "design.bowAnchorRollerHeight") ??
      DEFAULTS.rollerHeight;
    config.gpsBowXDistance =
      SignalKClient.value(data, "sensors.gps.fromCenter") ??
      DEFAULTS.gpsBowXDistance;
    config.gpsBowYDistance =
      SignalKClient.value(data, "sensors.gps.fromBow") ??
      DEFAULTS.gpsBowYDistance;
    config.aisShipType =
      SignalKClient.value(data, "design.aisShipType")?.id ??
      DEFAULTS.aisShipType;
    config.mmsi = data.mmsi;

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
