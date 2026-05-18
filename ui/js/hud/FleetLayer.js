// FleetLayer owns every vessel marker and history hotline on the map,
// including our own. The host drives it with three inputs: a one-shot bulk
// history load from /tracks, per-tick own-position append, and per-tick AIS
// sync from /vessels. Out-of-range AIS vessels are removed on each sync; the
// own boat is never auto-removed (its mmsi key never appears in the AIS list).

import { GeoMath, MPS_TO_KNOTS } from "../GeoMath.js";
import { SignalKHelper } from "../SignalKHelper.js";
import { BoatConfig } from "../BoatConfig.js";

const MAX_OWN_TRACK_POINTS = 3600 * 24; // 24 hours at 1Hz
const POLL_INTERVAL_MS = 5000;
const DEFAULT_FILTER_RADIUS = 500;

const GPS_ANTENNA_ICON = L.icon({
  iconUrl: "icons/antenna.svg",
  iconSize: [25, 25],
  iconAnchor: [13, 25],
});

export class FleetLayer {
  constructor({ app, map, ownMmsi }) {
    this.app = app;
    this.map = map;
    this.ownMmsi = ownMmsi;
    this.vessels = {}; // mmsi -> L.BoatMarker (with .gpsAntennaMarker attached)
    this.vesselTracks = {}; // mmsi -> L.hotline
    this.ownVessel = undefined;
    this.ownAntenna = undefined;
    this.ownBoatConfig = undefined;
    this.fleetTimer = null;
    this._pollInFlight = false;
    this.filterRadius = DEFAULT_FILTER_RADIUS;

    this.setOwnVessel(this.app.state.getPosition(), this.app.state.boatConfig);

    this.loadInitialData();
  }

  loadInitialData() {
    this.app.signalK
      .fetchTracks(this.filterRadius)
      .then((tracks) => {
        this.loadHistoricalTracks(
          tracks,
          this.app.state.getPosition(),
          this.filterRadius,
        );
      })
      .catch((err) => {
        const detail = err.statusText || err.message || "unknown error";
        this.app.statusBar.setWarning(`Tracks plugin not available: ${detail}`);
      });

    this.fleetTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.poll();
  }

  poll() {
    if (this._pollInFlight)
      return;
    this._pollInFlight = true;
    this.app.signalK
      .fetchAllVessels()
      .then((vessels) => {
        this.syncOtherVessels(vessels, {
          ownLatLng: this.app.state.getPosition(),
          filterRadius: this.filterRadius,
          twa: this.app.state.twa,
        });
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const status = error.status ? `${error.status} ` : "";
        const msg = `Fleet update failed: ${status}${detail}`;

        this.app.statusBar.setWarning(msg);
        console.error(msg, error);
      })
      .finally(() => {
        this._pollInFlight = false;
      });
  }

  update(state) {
    this.updateOwnPosition(state.getPosition(), state.boatConfig.heading);
    this.appendOwnTrack(state.getPosition());
  }

  // Own boat is kept outside the AIS vessels dict so syncOtherVessels never
  // removes it.
  setOwnVessel(coords, boatConfig) {
    this.ownBoatConfig = boatConfig;
    this.ownVessel = new L.BoatMarker(coords, {
      beam: boatConfig.beam,
      loa: boatConfig.loa,
      gpsOffset: boatConfig.bowOffset,
      heading: boatConfig.heading,
      icon: boatConfig.icon,
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
      if (!match)
        continue;
      const mmsi = match[1];
      const data = tracks[uri];

      const history = data.coordinates?.[0];
      if (!history || !history.length)
        continue;

      const points = [];
      let i = 0;
      for (let position of history) {
        const lat = position[1];
        const lon = position[0];
        const distance = GeoMath.calculateDistance(
          ownLatLng.lat,
          ownLatLng.lng,
          lat,
          lon,
        );
        if (distance < filterRadius) {
          points.push([lat, lon, i]);
          i++;
        }
      }

      if (!points.length)
        continue;
      this.vesselTracks[mmsi] = this.createTrack(points, points.length);
    }
  }

  // Append a point to the own-boat track and trim to MAX_OWN_TRACK_POINTS.
  appendOwnTrack(latLng) {
    const ownTrack = this.vesselTracks[this.ownMmsi];
    if (!ownTrack)
      return;

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
      if (vessel.mmsi == this.ownMmsi)
        continue;
      if (!("navigation" in vessel) || !("position" in vessel.navigation))
        continue;

      const position = vessel.navigation.position.value;
      const distance = GeoMath.calculateDistance(
        position.latitude,
        position.longitude,
        ownLatLng.lat,
        ownLatLng.lng,
      );
      if (distance > filterRadius)
        continue;

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
    const detectedSet = new Set(detected.map(String));
    for (let mmsi in this.vessels) {
      if (!detectedSet.has(mmsi)) {
        const marker = this.vessels[mmsi];
        if (marker.gpsAntennaMarker)
          this.map.removeLayer(marker.gpsAntennaMarker);
        this.map.removeLayer(marker);
        delete this.vessels[mmsi];
        if (this.vesselTracks[mmsi]) {
          this.map.removeLayer(this.vesselTracks[mmsi]);
          delete this.vesselTracks[mmsi];
        }
      }
    }
  }

  // Heading preference: true heading > COG (only if moving) > observer's TWA > 0.
  // COG is wonky at low speed, so we gate it on SOG > 1 knot.
  deriveVesselHeading(vessel, twa) {
    let sog = 0;
    const sogVal = SignalKHelper.value(vessel, "navigation.speedOverGround");
    if (sogVal !== undefined)
      sog = sogVal * MPS_TO_KNOTS;

    const headingTrue = SignalKHelper.value(vessel, "navigation.headingTrue");
    if (headingTrue !== undefined)
      return GeoMath.rad2deg(headingTrue);

    const cog = SignalKHelper.value(vessel, "navigation.courseOverGroundTrue");
    if (cog !== undefined && sog > 1)
      return GeoMath.rad2deg(cog);

    if (twa)
      return GeoMath.rad2deg(twa.value);
    return 0;
  }

  updateExistingVessel(vessel, position, heading, distance) {
    const marker = this.vessels[vessel.mmsi];
    marker.setLatLng([position.latitude, position.longitude]);
    marker.setHeading(heading);
    marker.setPopupContent(`${vessel.name} at ${distance} meters`);
    marker.gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

    const track = this.vesselTracks[vessel.mmsi];
    if (!track)
      return;
    const last = track.getLatLngs().at(-1);
    if (
      last &&
      (last.lat != position.latitude || last.lng != position.longitude)
    ) {
      track.addLatLng([
        position.latitude,
        position.longitude,
        track.options.max,
      ]);
      track.options.max++;
    }
  }

  addNewVessel(vessel, position, heading, distance) {
    const config = BoatConfig.extract(vessel);

    const marker = new L.BoatMarker([position.latitude, position.longitude], {
      beam: config.beam,
      loa: config.loa,
      gpsOffset: config.bowOffset,
      heading: heading,
      icon: config.icon,
    });
    marker.addTo(this.map).bindPopup(`${vessel.name} at ${distance} meters`);

    marker.gpsAntennaMarker = L.marker(
      [position.latitude, position.longitude],
      {
        icon: GPS_ANTENNA_ICON,
      },
    ).addTo(this.map);

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
      color: "red",
      weight: 1,
      min: 0,
      max: max,
      palette: { 0.0: "red", 0.5: "yellow", 1.0: "green" },
      outlineWidth: 0,
      text: "",
    }).addTo(this.map);
  }
}
