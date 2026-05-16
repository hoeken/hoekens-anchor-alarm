// FleetLayer owns every vessel marker and history hotline on the map,
// including our own. The host drives it with three inputs: a one-shot bulk
// history load from /tracks, per-tick own-position append, and per-tick AIS
// sync from /vessels. Out-of-range AIS vessels are removed on each sync; the
// own boat is never auto-removed (its mmsi key never appears in the AIS list).

const MPS_TO_KNOTS = 1.94384;
const MAX_OWN_TRACK_POINTS = 3600 * 24; // 24 hours at 1Hz

const GPS_ANTENNA_ICON = L.icon({
  iconUrl: 'icons/antenna.svg',
  iconSize: [25, 25],
  iconAnchor: [13, 25],
});

class ShipIcons {
  static iconFor(aisShipType, aspectRatio) {
    aisShipType = parseInt(aisShipType, 10);

    // Sailing: pick monohull vs catamaran by hull aspect ratio.
    if (aisShipType === 36)
      return aspectRatio >= 2.5
        ? "icons/ships/png/sailboat.png"
        : "icons/ships/png/catamaran.png";

    const range = ShipIcons.RANGES.find(
      r => aisShipType >= r.start && aisShipType <= r.end
    );

    return range
      ? `icons/ships/png/${range.icon}`
      : "icons/ships/png/default.png";
  }
}

// AIS ship-type code → icon filename (under icons/ships/png/).
// Code 36 (sailing) is handled separately to switch on hull aspect ratio.
// Codes 0, 1-19, 38, 39, 56, 57 are unmapped and fall through to default.png.
ShipIcons.RANGES = [
  { start: 20, end: 29, icon: 'wing-in-ground.png' },   // Wing in ground (WIG)
  { start: 30, end: 30, icon: 'fishing.png' },
  { start: 31, end: 32, icon: 'towing.png' },
  { start: 33, end: 33, icon: 'dredging.png' },
  { start: 34, end: 34, icon: 'diving.png' },
  { start: 35, end: 35, icon: 'military.png' },
  { start: 37, end: 37, icon: 'pleasure.png' },
  { start: 40, end: 49, icon: 'high-speed-craft.png' }, // High speed craft (HSC)
  { start: 50, end: 50, icon: 'pilot.png' },
  { start: 51, end: 51, icon: 'sar.png' },
  { start: 52, end: 52, icon: 'tug.png' },
  { start: 53, end: 53, icon: 'port-tender.png' },
  { start: 54, end: 54, icon: 'anti-pollution.png' },
  { start: 55, end: 55, icon: 'police.png' },
  { start: 58, end: 58, icon: 'medical.png' },
  { start: 59, end: 59, icon: 'noncombatant.png' },
  { start: 60, end: 69, icon: 'passenger.png' },
  { start: 70, end: 79, icon: 'cargo.png' },
  { start: 80, end: 89, icon: 'tanker.png' },
  { start: 90, end: 99, icon: 'other.png' },
];

class FleetLayer {

  constructor({ map, ownMmsi }) {
    this.map = map;
    this.ownMmsi = ownMmsi;
    this.vessels = {};      // mmsi -> L.BoatMarker (with .gpsAntennaMarker attached)
    this.vesselTracks = {}; // mmsi -> L.hotline
    this.ownVessel = undefined;
    this.ownAntenna = undefined;
  }

  // Own boat is kept outside the AIS vessels dict so syncOtherVessels never
  // removes it.
  setOwnVessel(coords, heading, { beam, loa, gpsBowXDistance, gpsBowYDistance, aisShipType }) {
    // BoatMarker takes x-offset from the left edge of the hull, not center.
    const xOffset = beam / 2 + gpsBowXDistance;

    this.ownVessel = new L.BoatMarker(coords, {
      beam: beam,
      loa: loa,
      gpsOffset: { x: xOffset, y: gpsBowYDistance },
      heading: heading,
      icon: ShipIcons.iconFor(aisShipType, loa / beam),
    }).addTo(this.map);

    this.ownAntenna = L.marker(coords, {
      icon: GPS_ANTENNA_ICON,
    }).addTo(this.map);
  }

  updateOwnPosition(coords, heading) {
    this.ownVessel.setLatLng(coords);
    this.ownVessel.setHeading(heading);
    this.ownAntenna.setLatLng(coords);
  }

  // Initial bulk history load from /tracks. Includes self.
  loadHistoricalTracks(tracks, ownLatLng, filterRadius) {
    const mmsiRegex = /urn:mrn:imo:mmsi:(\d+)$/;
    for (let uri in tracks) {
      const match = uri.match(mmsiRegex);
      if (!match) continue;
      const mmsi = match[1];
      const data = tracks[uri];

      if (!data.coordinates[0].length) continue;

      const history = data.coordinates[0];
      const points = [];
      let i = 0;
      for (let position of history) {
        const lat = position[1];
        const lon = position[0];
        const distance = GeoMath.calculateDistance(ownLatLng.lat, ownLatLng.lng, lat, lon);
        if (distance < filterRadius) {
          points.push([lat, lon, i]);
          i++;
        }
      }

      this.vesselTracks[mmsi] = this.createTrack(points, points.length);
    }
  }

  // Append a point to the own-boat track and trim to MAX_OWN_TRACK_POINTS.
  appendOwnTrack(latLng) {
    const ownTrack = this.vesselTracks[this.ownMmsi];
    if (!ownTrack) return;

    ownTrack.addLatLng([latLng.lat, latLng.lng, ownTrack.getLatLngs().length]);
    ownTrack.options.max++;

    // Trim oldest points so the track doesn't grow unbounded over a long watch.
    const pts = ownTrack.getLatLngs();
    if (pts.length > MAX_OWN_TRACK_POINTS) {
      const trimmed = pts.slice(-MAX_OWN_TRACK_POINTS);
      ownTrack.setLatLngs(trimmed);
      ownTrack.options.min = trimmed[0].alt;
    }
  }

  // Reconcile other-vessel markers and tracks against a fresh /vessels payload.
  syncOtherVessels(vessels, { ownLatLng, filterRadius, twa }) {
    const detected = [];

    for (let key in vessels) {
      const vessel = vessels[key];
      if (vessel.mmsi == this.ownMmsi) continue;
      if (!("navigation" in vessel) || !("position" in vessel.navigation)) continue;

      const position = vessel.navigation.position.value;
      const distance = GeoMath.calculateDistance(
        position.latitude, position.longitude,
        ownLatLng.lat, ownLatLng.lng,
      );
      if (distance > filterRadius) continue;

      detected.push(vessel.mmsi);
      const heading = this.deriveVesselHeading(vessel, twa);
      const distanceRounded = Math.round(distance);

      if (vessel.mmsi in this.vessels) {
        this.updateExistingVessel(vessel, position, heading, distanceRounded);
      } else {
        this.addNewVessel(vessel, position, heading, distanceRounded);
      }
    }

    // Drop vessels that left the radius.
    for (let mmsi in this.vessels) {
      if (!detected.includes(mmsi)) {
        this.map.removeLayer(this.vessels[mmsi]);
        delete this.vessels[mmsi];
        this.map.removeLayer(this.vesselTracks[mmsi]);
        delete this.vesselTracks[mmsi];
      }
    }
  }

  // Heading preference: true heading > COG (only if moving) > observer's TWA > 0.
  // COG is wonky at low speed, so we gate it on SOG > 1 knot.
  deriveVesselHeading(vessel, twa) {
    let sog = 0;
    const sogVal = SignalKClient.value(vessel, 'navigation.speedOverGround');
    if (sogVal !== undefined) sog = sogVal * MPS_TO_KNOTS;

    const headingTrue = SignalKClient.freshValue(vessel, 'navigation.headingTrue');
    if (headingTrue !== undefined) return GeoMath.rad2deg(headingTrue);

    const cog = SignalKClient.value(vessel, 'navigation.courseOverGroundTrue');
    if (cog !== undefined && sog > 1) return GeoMath.rad2deg(cog);

    if (twa !== null) return twa;
    return 0;
  }

  updateExistingVessel(vessel, position, heading, distance) {
    const marker = this.vessels[vessel.mmsi];
    marker.setLatLng([position.latitude, position.longitude]);
    marker.setHeading(heading);
    marker.setPopupContent(`${vessel.name} at ${distance} meters`);
    marker.gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

    const track = this.vesselTracks[vessel.mmsi];
    if (!track) return;
    const last = track.getLatLngs().at(-1);
    if (last && (last.lat != position.latitude || last.lng != position.longitude)) {
      track.addLatLng([position.latitude, position.longitude, track.options.max]);
      track.options.max++;
    }
  }

  addNewVessel(vessel, position, heading, distance) {
    // AIS defaults for missing fields. 36 = sailing, see ShipIcons.iconFor.
    let loa = 14;
    let beam = 4;
    let aisShipType = 36;
    let gpsXOffset = 0;
    let gpsYOffset = 0;

    const aisFromCenter = SignalKClient.value(vessel, 'sensors.ais.fromCenter');
    if (aisFromCenter !== undefined) gpsXOffset = parseFloat(aisFromCenter);
    const aisFromBow = SignalKClient.value(vessel, 'sensors.ais.fromBow');
    if (aisFromBow !== undefined) gpsYOffset = parseFloat(aisFromBow);
    const vesselLength = SignalKClient.value(vessel, 'design.length');
    if (vesselLength !== undefined) loa = parseFloat(vesselLength.overall);
    const vesselBeam = SignalKClient.value(vessel, 'design.beam');
    if (vesselBeam !== undefined) beam = parseFloat(vesselBeam);
    const vesselShipType = SignalKClient.value(vessel, 'design.aisShipType');
    if (vesselShipType?.id !== undefined) aisShipType = vesselShipType.id;

    // BoatMarker takes x-offset from the left edge of the hull, not center.
    const xOffset = beam / 2 + gpsXOffset;

    const marker = new L.BoatMarker([position.latitude, position.longitude], {
      beam: beam,
      loa: loa,
      gpsOffset: { x: xOffset, y: gpsYOffset },
      heading: heading,
      icon: ShipIcons.iconFor(aisShipType, loa / beam),
    });
    marker.addTo(this.map).bindPopup(`${vessel.name} at ${distance} meters`);

    marker.gpsAntennaMarker = L.marker([position.latitude, position.longitude], {
      icon: GPS_ANTENNA_ICON,
    }).addTo(this.map);

    this.vessels[vessel.mmsi] = marker;

    // The history load may have already created a track for this mmsi.
    if (!(vessel.mmsi in this.vesselTracks)) {
      this.vesselTracks[vessel.mmsi] = this.createTrack(
        [[position.latitude, position.longitude, 0]],
        1,
      );
    }
  }

  createTrack(points, max) {
    return L.hotline(points, {
      color: 'red',
      weight: 1,
      min: 0,
      max: max,
      palette: { 0.0: 'red', 0.5: 'yellow', 1.0: 'green' },
      outlineWidth: 0,
      text: '',
    }).addTo(this.map);
  }
}
