// BoatConfig is an immutable value object describing a vessel's geometry and
// identity: LOA, beam, GPS antenna offsets, anchor roller height, AIS ship
// type, and MMSI. The same shape covers our own boat (fromSelf, parsed from
// /self) and AIS-detected vessels (fromVessel, parsed from a /vessels record
// with permissive defaults for the often-missing fields).

import { SignalKClient } from "./SignalKClient.js";
import { ShipIcons } from "./ShipIcons.js";

export class BoatConfig {
  constructor({
    loa,
    beam,
    anchorRollerHeight,
    gpsBowXDistance,
    gpsBowYDistance,
    aisShipType,
    mmsi,
  }) {
    this.loa = loa;
    this.beam = beam;
    this.anchorRollerHeight = anchorRollerHeight;
    this.gpsBowXDistance = gpsBowXDistance;
    this.gpsBowYDistance = gpsBowYDistance;
    this.aisShipType = aisShipType;
    this.mmsi = mmsi;
  }

  static fromSelf(data) {
    let loa = 0,
      beam = 0,
      anchorRollerHeight = 0;
    let gpsBowXDistance = 0,
      gpsBowYDistance = 0;
    let aisShipType = 0;

    const designLength = SignalKClient.value(data, "design.length");
    if (designLength !== undefined) loa = parseFloat(designLength.overall);
    const designBeam = SignalKClient.value(data, "design.beam");
    if (designBeam !== undefined) beam = parseFloat(designBeam);
    const rollerHeight = SignalKClient.value(
      data,
      "design.bowAnchorRollerHeight",
    );
    if (rollerHeight !== undefined)
      anchorRollerHeight = parseFloat(rollerHeight);
    const fromBow = SignalKClient.value(data, "sensors.gps.fromBow");
    if (fromBow !== undefined) gpsBowYDistance = parseFloat(fromBow);
    const fromCenter = SignalKClient.value(data, "sensors.gps.fromCenter");
    if (fromCenter !== undefined) gpsBowXDistance = parseFloat(fromCenter);
    const shipType = SignalKClient.value(data, "design.aisShipType");
    if (shipType?.id !== undefined) aisShipType = shipType.id;

    return new BoatConfig({
      loa,
      beam,
      anchorRollerHeight,
      gpsBowXDistance,
      gpsBowYDistance,
      aisShipType,
      mmsi: data.mmsi,
    });
  }

  // AIS broadcasts are often partial; degrade gracefully rather than refuse
  // to render. Defaults: 14m sailboat (ship type 36 = sailing).
  static fromVessel(vessel) {
    let loa = 14,
      beam = 4,
      aisShipType = 36;
    let gpsBowXDistance = 0,
      gpsBowYDistance = 0;

    const aisFromCenter = SignalKClient.value(vessel, "sensors.ais.fromCenter");
    if (aisFromCenter !== undefined)
      gpsBowXDistance = parseFloat(aisFromCenter);
    const aisFromBow = SignalKClient.value(vessel, "sensors.ais.fromBow");
    if (aisFromBow !== undefined) gpsBowYDistance = parseFloat(aisFromBow);
    const vesselLength = SignalKClient.value(vessel, "design.length");
    if (vesselLength !== undefined) loa = parseFloat(vesselLength.overall);
    const vesselBeam = SignalKClient.value(vessel, "design.beam");
    if (vesselBeam !== undefined) beam = parseFloat(vesselBeam);
    const vesselShipType = SignalKClient.value(vessel, "design.aisShipType");
    if (vesselShipType?.id !== undefined) aisShipType = vesselShipType.id;

    return new BoatConfig({
      loa,
      beam,
      anchorRollerHeight: 0,
      gpsBowXDistance,
      gpsBowYDistance,
      aisShipType,
      mmsi: vessel.mmsi,
    });
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
