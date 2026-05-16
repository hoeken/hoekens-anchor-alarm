// AnchorAlarm is the composition root: it owns the anchor state machine,
// boat geometry, and the polling lifecycle, and delegates rendering to
// FleetLayer (vessels + tracks) and the four HudPanels (Info/Scope/Wind/Home).

const POLL_INTERVAL_MS = 1000;
const STALE_RELOAD_MS = 5 * 60 * 1000;
const INITIAL_LOAD_RETRY_MS = 5000;

const AnchorState = Object.freeze({
  UP: 'UP',
  DROPPING: 'DROPPING',
  ANCHORED: 'ANCHORED',
  RAISING: 'RAISING',
});

const ANCHOR_ICON = L.icon({
  iconUrl: 'icons/anchor.png',
  iconSize: [24, 24],
  iconAnchor: [12, 4],
});

const CROSSHAIR_ICON = L.icon({
  iconUrl: 'icons/crosshair.png',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

class AnchorAlarm {

  constructor() {
    this.signalK = new SignalKClient({ pluginName: 'hoekens-anchor-alarm' });

    this.heading = undefined;
    this.currentCoordinates = undefined;
    this.anchorCoordinates = undefined;
    this.filterRadius = 500;
    this.mmsi = undefined;
    this.maxRadius = 50;

    this.twa = null;
    this.aws = null;

    this.boatLOA = 0;
    this.boatBeam = 0;
    this.boatAnchorRollerHeight = 0;
    this.gpsBowYDistance = 0;
    this.gpsBowXDistance = 0;
    this.aisShipType = 0;
    this.tidalRise = 0;
    this.tidalFall = 0;

    this.state = AnchorState.UP;
    this.homeZoom = undefined;

    this.myBoatMarker = undefined;
    this.gpsAntennaMarker = undefined;
    this.anchorMarker = undefined;
    this.anchorRadiusCircle = undefined;

    this.map = undefined;
    this.fleetLayer = undefined;

    this.infoPanel = undefined;
    this.scopePanel = undefined;
    this.windPanel = undefined;
    this.homeButton = undefined;

    this.crosshairMarker = undefined;

    this.anchorLine = undefined;
    this.anchorLineAngle = undefined;

    this.hiddenAt = null;
    this.pollTimer = null;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  init() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
      } else if (this.hiddenAt !== null) {
        const elapsed = Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        if (elapsed >= STALE_RELOAD_MS) {
          window.location.reload();
        }
      }
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        window.location.reload();
      }
    });

    this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 23,
      maxNativeZoom: 17,      // Highest zoom level Esri has real imagery for
      tileSize: 256,
      noWrap: true,
      keepBuffer: 5
    });

    this.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data from OpenStreetMap (OSM)',
      maxZoom: 23
    });

    this.baseMaps = {
      "OpenStreetMap": this.osmLayer,
      "Satellite": this.satelliteLayer
    };

    this.wireButtons();
    this.loadInitialData();
  }

  wireButtons() {
    $('#raiseAnchor').click(() => {
      if (this.state !== AnchorState.ANCHORED) return;
      let agree = confirm('Do you really want to disable your anchor alarm?');
      if (!agree) return;
      this.state = AnchorState.RAISING;
      this.raiseAnchor(); //better UI response outside.
      this.signalK.raiseAnchor().always(() => {
        this.state = AnchorState.UP;
      });
    });

    $('#dropAnchor').click(() => {
      if (this.state !== AnchorState.UP) return;
      let mc = this.crosshairMarker.getLatLng();
      this.state = AnchorState.DROPPING;
      this.dropAnchor(mc, this.maxRadius); //better UI response outside.
      this.signalK.dropAnchor({ latitude: mc.lat, longitude: mc.lng }, this.maxRadius).always(() => {
        this.state = AnchorState.ANCHORED;
      });
    });

    $('#setRadius').click(() => {
      let input = prompt('Enter Radius (m)', this.maxRadius);
      if (input === null)
        return;
      let newRadius = parseInt(input, 10);
      if (isNaN(newRadius) || newRadius <= 0)
        return;

      this.setMaxRadius(newRadius);
    });

    $('#increaseRadius').click(() => {
      this.setMaxRadius(this.maxRadius + 5);
    });

    // macOS Chrome delivers trackpad pinch as a wheel event with ctrlKey=true.
    // Over the #map_toggle overlay the browser would zoom the page instead of
    // the map, so swallow the default and re-dispatch onto the map container.
    document.getElementById('map_toggle').addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.map.getContainer().dispatchEvent(new WheelEvent('wheel', {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: false,
        cancelable: true,
      }));
    }, { passive: false });

    $('#decreaseRadius').click(() => {
      if (this.maxRadius <= 5)
        return;
      this.setMaxRadius(this.maxRadius - 5);
    });
  }

  // === Initial load (one /self call, broken into phases) ===========================

  loadInitialData() {
    this.signalK.fetchSelf().done((data) => {
      this.mmsi = data.mmsi;

      const belowKeel = SignalKClient.freshValue(data, 'environment.depth.belowKeel', { fallback: 0 });
      const belowSurface = SignalKClient.freshValue(data, 'environment.depth.belowSurface', { fallback: 0 });

      this.applyInitialWindState(data);
      this.applyBoatConfig(data);
      this.applyInitialTide(data);

      const anchorDistanceGuess = this.calculateScope(5, belowSurface);
      this.computeDefaultRadius(anchorDistanceGuess);

      this.currentCoordinates = this.extractStartPosition(data);
      this.buildMap(this.currentCoordinates);

      this.paintInitialReadings(belowSurface, belowKeel, data);

      this.heading = this.computeInitialHeading(data);
      this.placeOwnVessel(this.currentCoordinates, this.heading);
      this.placeAnchorWidgets(this.currentCoordinates);
      this.restoreAnchorState(data, anchorDistanceGuess);

      this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
      this.map.fitBounds(this.anchorRadiusCircle.getBounds());
      this.homeZoom = this.map.getZoom();

      this.fleetLayer = new FleetLayer({ map: this.map, ownMmsi: this.mmsi });
      this.signalK.fetchTracks(this.filterRadius).done((tracks) => {
        this.fleetLayer.loadHistoricalTracks(tracks, this.currentCoordinates, this.filterRadius);
      });

      this.pollTimer = setInterval(() => this.intervalUpdate(), POLL_INTERVAL_MS);
    }).fail((response) => {
      console.error('Failed to load initial data:', response.status, response.statusText);
      setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
    });
  }

  applyInitialWindState(data) {
    const directionTrue = SignalKClient.freshValue(data, 'environment.wind.directionTrue');
    if (directionTrue !== undefined) this.twa = GeoMath.rad2deg(directionTrue);
  }

  applyBoatConfig(data) {
    const designLength = SignalKClient.value(data, 'design.length');
    if (designLength !== undefined) this.boatLOA = parseFloat(designLength.overall);
    const designBeam = SignalKClient.value(data, 'design.beam');
    if (designBeam !== undefined) this.boatBeam = parseFloat(designBeam);
    const rollerHeight = SignalKClient.value(data, 'design.bowAnchorRollerHeight');
    if (rollerHeight !== undefined) this.boatAnchorRollerHeight = parseFloat(rollerHeight);
    const fromBow = SignalKClient.value(data, 'sensors.gps.fromBow');
    if (fromBow !== undefined) this.gpsBowYDistance = fromBow;
    const fromCenter = SignalKClient.value(data, 'sensors.gps.fromCenter');
    if (fromCenter !== undefined) this.gpsBowXDistance = fromCenter;
    const shipType = SignalKClient.value(data, 'design.aisShipType');
    if (shipType?.id !== undefined) this.aisShipType = shipType.id;
  }

  applyInitialTide(data) {
    const tide = SignalKClient.extract(data, 'environment.tide');
    if (!tide) return;
    const currentTide = GeoMath.estimateTideHeightSmooth(
      tide.timeLow.value, tide.heightLow.value,
      tide.timeHigh.value, tide.heightHigh.value,
    );
    this.tidalRise = tide.heightHigh.value - currentTide;
    this.tidalFall = currentTide - tide.heightLow.value;
  }

  // Default radius = 5:1 scope + GPS-to-bow vector, ×1.5 safety, rounded to a
  // 5-meter step and clamped to [0, 200].
  computeDefaultRadius(anchorDistanceGuess) {
    let r = anchorDistanceGuess;
    r += GeoMath.calculateVectorDistance(this.gpsBowXDistance, this.gpsBowYDistance);
    r *= 1.5;
    r = Math.round(r / 5) * 5;
    r = Math.max(0, r);
    r = Math.min(200, r);
    this.maxRadius = r;
  }

  extractStartPosition(data) {
    const navPosition = SignalKClient.value(data.navigation, 'position');
    return L.latLng(navPosition.latitude, navPosition.longitude);
  }

  buildMap(initialCenter) {
    this.map = L.map('map', { zoomControl: false }).setView(initialCenter, 5);

    this.satelliteLayer.addTo(this.map);

    L.control.scale({ position: 'topleft' }).addTo(this.map);
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    this.homeButton = new HomeButtonControl({
      onHome: (map) => {
        if (!this.currentCoordinates) return;
        const doPan = () => map.panTo(this.currentCoordinates);
        if (this.homeZoom != null && map.getZoom() !== this.homeZoom) {
          map.once('zoomend', doPan);
          map.setZoom(this.homeZoom);
        } else {
          doPan();
        }
      }
    });
    this.map.addControl(this.homeButton);

    L.control.layers(this.baseMaps, {}, { position: 'topright' }).addTo(this.map);

    this.infoPanel = new InfoPanel();
    this.scopePanel = new ScopePanel();
    this.windPanel = new WindPanel();
    this.map.addControl(this.infoPanel);
    this.map.addControl(this.scopePanel);
    this.map.addControl(this.windPanel);
  }

  paintInitialReadings(belowSurface, belowKeel, data) {
    this.infoPanel.setBelowSurface(belowSurface);
    this.scopePanel.setBelowKeel(belowKeel);

    const speedApparent = SignalKClient.freshValue(data, 'environment.wind.speedApparent');
    if (speedApparent !== undefined) this.windPanel.setSpeed(speedApparent, this.twa);
    if (this.twa !== null) this.windPanel.setAngle(this.twa);
  }

  // Heading priority: SignalK headingTrue > bearing-to-anchor (if dropped) >
  // last-known TWA > 0. The anchor-pointing branch also primes
  // anchorCoordinates because restoreAnchorState reads it.
  computeInitialHeading(data) {
    const nav = data.navigation;
    let heading = SignalKClient.value(nav, 'headingTrue');
    const initialAnchorPos = SignalKClient.value(nav, 'anchor.position');

    if (heading != null) return GeoMath.rad2deg(heading);

    if (initialAnchorPos) {
      this.anchorCoordinates = L.latLng(initialAnchorPos.latitude, initialAnchorPos.longitude);
      return Math.round(GeoMath.calculateBearing(
        this.currentCoordinates.lat, this.currentCoordinates.lng,
        this.anchorCoordinates.lat, this.anchorCoordinates.lng,
      ));
    }

    return this.twa ?? 0;
  }

  placeOwnVessel(coords, heading) {
    // BoatMarker takes x-offset from the left edge of the hull, not center.
    const xOffset = this.boatBeam / 2 + this.gpsBowXDistance;

    this.myBoatMarker = new L.BoatMarker(coords, {
      beam: this.boatBeam,
      loa: this.boatLOA,
      gpsOffset: { x: xOffset, y: this.gpsBowYDistance },
      heading: heading,
      icon: ShipIcons.iconFor(this.aisShipType, this.boatLOA / this.boatBeam),
    }).addTo(this.map);

    this.gpsAntennaMarker = L.marker(coords, {
      icon: GPS_ANTENNA_ICON,
    }).addTo(this.map);
  }

  // The anchor line uses two overlapping polylines because leaflet.textpath
  // only supports one label per polyline; one carries the distance label, the
  // other (invisible) carries the bearing label.
  placeAnchorWidgets(coords) {
    this.anchorRadiusCircle = L.circle(this.map.getCenter(), this.maxRadius, { color: 'green' });
    this.anchorRadiusCircle.addTo(this.map);
    this.uiSetRadius(this.maxRadius);

    this.anchorCoordinates = this.map.getCenter();

    this.anchorLine = L.polyline([coords, this.anchorCoordinates], {
      color: 'grey',
      weight: 2,
    }).addTo(this.map);

    this.anchorLineAngle = L.polyline([coords, this.anchorCoordinates], {
      color: 'grey',
      weight: 0,
    }).addTo(this.map);
  }

  restoreAnchorState(data, anchorDistanceGuess) {
    const nav = data.navigation;
    const initialAnchorPos = SignalKClient.value(nav, 'anchor.position');

    if (initialAnchorPos) {
      this.anchorCoordinates = L.latLng(initialAnchorPos.latitude, initialAnchorPos.longitude);
      const radius = parseInt(SignalKClient.value(nav, 'anchor.maxRadius'), 10);
      // Set state before dropAnchor so uiSetRadiusColor (called inside) paints green.
      this.state = AnchorState.ANCHORED;
      this.dropAnchor(this.anchorCoordinates, radius);
    } else {
      const bowPos = GeoMath.calculateBowCoordinates(this.currentCoordinates, this.heading, this.gpsBowXDistance, this.gpsBowYDistance);
      const anchorPositionGuess = GeoMath.calculateDestinationPoint(bowPos.lat, bowPos.lng, this.heading, anchorDistanceGuess);
      this.anchorCoordinates = L.latLng(anchorPositionGuess.latitude, anchorPositionGuess.longitude);
      this.raiseAnchor();
    }
  }

  // === Live polling ================================================================

  intervalUpdate() {
    this.pollPosition();
    this.pollAnchorStatus();
    this.pollDepth();
    this.pollWindSpeed();
    this.pollWindAngle();
    this.pollAnchorReconcile();
    this.pollFleet();
  }

  pollPosition() {
    this.signalK.fetchSelfNavigation().done((data) => {
      if (SignalKClient.isStale(data.position)) {
        console.error("Position stale");
        return;
      }

      const position = SignalKClient.value(data, 'position');
      if (position.latitude === null || position.longitude === null) {
        console.error("Invalid position");
        console.error(data.position);
        return;
      }

      this.currentCoordinates = L.latLng(position.latitude, position.longitude);

      const headingTrue = SignalKClient.freshValue(data, 'headingTrue');
      if (headingTrue !== undefined) {
        this.heading = GeoMath.rad2deg(headingTrue);
      } else {
        // No live heading — point at the anchor instead.
        this.heading = Math.round(GeoMath.calculateBearing(
          this.currentCoordinates.lat, this.currentCoordinates.lng,
          this.anchorCoordinates.lat, this.anchorCoordinates.lng,
        ));
      }

      this.myBoatMarker.setLatLng(this.currentCoordinates);
      this.myBoatMarker.setHeading(this.heading);
      this.gpsAntennaMarker.setLatLng(this.currentCoordinates);

      this.fleetLayer.appendOwnTrack(this.currentCoordinates);

      this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
    });
  }

  pollAnchorStatus() {
    this.signalK.fetchAnchorAlarm().done((alarm) => {
      const v = SignalKClient.value(alarm);
      if (!v) return;
      this.infoPanel.setStatus(v.message, v.state);
    });
  }

  pollDepth() {
    this.signalK.fetchDepth().done((data) => {
      const belowSurface = SignalKClient.value(data, 'belowSurface', 0);
      const belowKeel = SignalKClient.value(data, 'belowKeel', 0);

      this.infoPanel.setBelowSurface(belowSurface);
      this.scopePanel.setScopeData({
        depthBelowSurface: parseFloat(belowSurface),
        depthBelowKeel: parseFloat(belowKeel),
        bowHeight: this.boatAnchorRollerHeight,
        tidalRise: this.tidalRise,
        tidalFall: this.tidalFall,
        scopes: {
          7: this.calculateScope(7, belowSurface),
          5: this.calculateScope(5, belowSurface),
          4: this.calculateScope(4, belowSurface),
          3: this.calculateScope(3, belowSurface),
        },
      });
    }).fail(() => {
      this.infoPanel.setBelowSurface(null);
      this.scopePanel.setBelowKeel(null);
    });
  }

  pollWindSpeed() {
    this.signalK.fetchWindSpeedApparent().done((speedApparent) => {
      this.aws = speedApparent;
      this.windPanel.setSpeed(speedApparent, this.twa);
    }).fail(() => {
      this.windPanel.clearSpeed();
    });
  }

  pollWindAngle() {
    this.signalK.fetchWindDirectionTrue().done((directionTrue) => {
      this.twa = GeoMath.rad2deg(directionTrue);
      this.windPanel.setAngle(this.twa);
    });
  }

  // Reconcile against the server's anchor state. We skip while a drop/raise
  // POST is in flight — the server doesn't reflect our pending change yet,
  // so we'd flip ourselves back.
  pollAnchorReconcile() {
    this.signalK.fetchAnchorState().done((anchorStatus) => {
      if (this.state !== AnchorState.UP && this.state !== AnchorState.ANCHORED) return;

      const serverOn = SignalKClient.value(anchorStatus, 'state') === "on";

      if (serverOn) {
        this.maxRadius = SignalKClient.value(anchorStatus, 'maxRadius');
        const anchorPos = SignalKClient.value(anchorStatus, 'position');
        this.anchorCoordinates = L.latLng(anchorPos.latitude, anchorPos.longitude);

        if (this.state === AnchorState.UP) {
          // Flip state before dropAnchor so uiSetRadiusColor paints green.
          this.state = AnchorState.ANCHORED;
          this.dropAnchor(this.anchorCoordinates, this.maxRadius);
        } else {
          this.uiSetRadius(this.maxRadius);
        }
      } else if (this.state === AnchorState.ANCHORED) {
        this.state = AnchorState.UP;
        this.raiseAnchor();
      }
    });
  }

  pollFleet() {
    this.signalK.fetchAllVessels().done((vessels) => {
      this.fleetLayer.syncOtherVessels(vessels, {
        ownLatLng: this.currentCoordinates,
        filterRadius: this.filterRadius,
        twa: this.twa,
      });
    });
  }

  // === Anchor operations ===========================================================

  uiSetRadius(radius) {
    $('#radius').html(radius);
    this.anchorRadiusCircle.setRadius(radius);
    this.uiSetRadiusColor();
  }

  setMaxRadius(newRadius) {
    this.maxRadius = newRadius;
    this.uiSetRadius(newRadius);

    if (this.state === AnchorState.ANCHORED) {
      this.signalK.setRadius(newRadius);
    }
  }

  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  uiSetRadiusColor() {
    const center = this.anchorRadiusCircle.getLatLng();
    const boat = this.myBoatMarker.getLatLng();
    const radius = this.anchorRadiusCircle.getRadius();
    const distance = GeoMath.calculateDistance(center.lat, center.lng, boat.lat, boat.lng);

    if (distance > radius)
      this.anchorRadiusCircle.setStyle({ color: 'red' });
    else if (this.state === AnchorState.ANCHORED || this.state === AnchorState.DROPPING)
      this.anchorRadiusCircle.setStyle({ color: 'green' });
    else
      this.anchorRadiusCircle.setStyle({ color: 'blue' });
  }

  dropAnchor(position, radius) {
    $('#anchorDown').show();
    $('#anchorUp').hide();

    this.anchorCoordinates = position;

    this.scopePanel.hide();
    this.infoPanel.show();

    this.maxRadius = parseInt(radius, 10);
    if (this.maxRadius <= 0)
      this.maxRadius = 20;

    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = undefined;
    }

    this.anchorRadiusCircle.setLatLng(position);
    this.uiSetRadius(this.maxRadius);

    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = undefined;
    }

    this.anchorMarker = L.marker(position, {
      icon: ANCHOR_ICON,
    }).addTo(this.map);
  }

  raiseAnchor() {
    $('#anchorUp').show();
    $('#anchorDown').hide();

    this.infoPanel.hide();
    this.scopePanel.show();

    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = undefined;
    }

    this.uiSetRadiusColor();

    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = undefined;
    }

    this.crosshairMarker = L.marker(this.anchorCoordinates, {
      icon: CROSSHAIR_ICON,
      draggable: true,
    }).addTo(this.map);

    this.crosshairMarker.on('drag', (ev) => {
      if (this.state !== AnchorState.ANCHORED) {
        this.anchorCoordinates = this.crosshairMarker.getLatLng();
        this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
        this.anchorRadiusCircle.setLatLng(this.crosshairMarker.getLatLng());
        this.uiSetRadiusColor();
      }
    });

    this.anchorRadiusCircle.setLatLng(this.anchorCoordinates);

    this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
  }

  updateAnchorLine(current, anchor) {
    const bowCoordinates = GeoMath.calculateBowCoordinates(current, this.heading, this.gpsBowXDistance, this.gpsBowYDistance);

    this.anchorLine.setLatLngs([bowCoordinates, anchor]);
    this.anchorLineAngle.setLatLngs([bowCoordinates, anchor]);

    // textpath label flipping: if the anchor is west of the bow, the label
    // reads upside-down without this flip. (Fails exactly on the equator.)
    const flip = bowCoordinates.lng > anchor.lng;

    let distance = GeoMath.calculateDistance(bowCoordinates.lat, bowCoordinates.lng, anchor.lat, anchor.lng);
    distance = Math.round(distance * 10) / 10;

    this.anchorLine.setText("");
    this.anchorLine.setText(`${distance}m`, {
      orientation: flip ? 'flip' : 0,
      offset: 12,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });

    const bearing = Math.round(GeoMath.calculateBearing(bowCoordinates.lat, bowCoordinates.lng, anchor.lat, anchor.lng));

    this.anchorLineAngle.setText("");
    this.anchorLineAngle.setText(`${bearing}°`, {
      orientation: flip ? 'flip' : 0,
      offset: -3,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });
  }

  // === Calculations ================================================================

  calculateScope(scope, dbs) {
    let maxHeight = dbs;
    maxHeight += this.boatAnchorRollerHeight; // height of the bow roller
    maxHeight += this.tidalRise;              // delta to high tide
    return maxHeight * scope;
  }
}

$(() => AnchorAlarm.startup());
