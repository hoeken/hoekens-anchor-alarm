// AnchorAlarm is the composition root: it owns the anchor state machine,
// boat geometry, and the polling lifecycle, and delegates rendering to
// FleetLayer (vessels + tracks) and the four HudPanels (Info/Scope/Wind/Home).

const POLL_INTERVAL_MS = 1000;
const INITIAL_LOAD_RETRY_MS = 5000;

const AnchorState = Object.freeze({
  UP: 'UP',
  DROPPING: 'DROPPING',
  ANCHORED: 'ANCHORED',
  RAISING: 'RAISING',
});

class AnchorAlarm {

  constructor() {
    this.signalK = new SignalKClient({ pluginName: 'hoekens-anchor-alarm' });

    this.heading = undefined;
    this.currentCoordinates = undefined;
    this.anchorCoordinates = undefined;
    this.filterRadius = 500;
    this.maxRadius = 50;

    this.twa = null;
    this.aws = null;

    this.boatConfig = undefined;
    this.tidalRise = 0;
    this.tidalFall = 0;

    this.state = AnchorState.UP;
    this.homeZoom = undefined;

    this.map = undefined;
    this.fleetLayer = undefined;
    this.anchorOverlay = undefined;

    this.infoPanel = undefined;
    this.scopePanel = undefined;
    this.windPanel = undefined;
    this.homeButton = undefined;
    this.toolbar = undefined;

    this.pollTimer = null;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  init() {
    new StaleReloader({ staleThresholdMs: 5 * 60 * 1000 }).start();

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

    this.toolbar = new ControlToolbar({
      getMapContainer: () => this.map && this.map.getContainer(),
      onRaise: () => {
        if (this.state !== AnchorState.ANCHORED) return;
        const agree = confirm('Do you really want to disable your anchor alarm?');
        if (!agree) return;
        this.state = AnchorState.RAISING;
        this.raiseAnchor(); //better UI response outside.
        this.signalK.raiseAnchor().always(() => {
          this.state = AnchorState.UP;
        });
      },
      onDrop: () => {
        if (this.state !== AnchorState.UP) return;
        const mc = this.anchorOverlay.getCrosshairPosition();
        this.state = AnchorState.DROPPING;
        this.dropAnchor(mc, this.maxRadius); //better UI response outside.
        this.signalK.dropAnchor({ latitude: mc.lat, longitude: mc.lng }, this.maxRadius).always(() => {
          this.state = AnchorState.ANCHORED;
        });
      },
      onSetRadius: (newRadius) => this.setMaxRadius(newRadius),
    });

    this.loadInitialData();
  }

  // === Initial load (one /self call, broken into phases) ===========================

  loadInitialData() {
    this.signalK.fetchSelf().done((data) => {
      this.boatConfig = BoatConfig.fromSelf(data);

      const belowKeel = SignalKClient.freshValue(data, 'environment.depth.belowKeel', { fallback: 0 });
      const belowSurface = SignalKClient.freshValue(data, 'environment.depth.belowSurface', { fallback: 0 });

      this.applyInitialWindState(data);
      this.applyInitialTide(data);

      const anchorDistanceGuess = this.calculateScope(5, belowSurface);
      this.computeDefaultRadius(anchorDistanceGuess);

      this.currentCoordinates = this.extractStartPosition(data);
      this.buildMap(this.currentCoordinates);

      this.paintInitialReadings(belowSurface, belowKeel, data);

      this.heading = this.computeInitialHeading(data);

      this.fleetLayer = new FleetLayer({ map: this.map, ownMmsi: this.boatConfig.mmsi });
      this.fleetLayer.setOwnVessel(this.currentCoordinates, this.heading, this.boatConfig);

      this.placeAnchorWidgets();
      this.restoreAnchorState(data, anchorDistanceGuess);

      this.map.fitBounds(this.anchorOverlay.getBounds());
      this.homeZoom = this.map.getZoom();

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
    r += GeoMath.calculateVectorDistance(this.boatConfig.gpsBowXDistance, this.boatConfig.gpsBowYDistance);
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

  placeAnchorWidgets() {
    this.anchorOverlay = new AnchorOverlay({ map: this.map, radius: this.maxRadius })
      .setBoatPosition(this.currentCoordinates, this.heading, this.boatConfig.gpsOffset)
      .onCrosshairDrag((pos) => {
        if (this.state !== AnchorState.ANCHORED) {
          this.anchorCoordinates = pos;
        }
      });
    this.toolbar.setRadius(this.maxRadius);
  }

  restoreAnchorState(data, anchorDistanceGuess) {
    const nav = data.navigation;
    const initialAnchorPos = SignalKClient.value(nav, 'anchor.position');

    if (initialAnchorPos) {
      this.anchorCoordinates = L.latLng(initialAnchorPos.latitude, initialAnchorPos.longitude);
      const radius = parseInt(SignalKClient.value(nav, 'anchor.maxRadius'), 10);
      // Set state before dropAnchor so the overlay paints green.
      this.state = AnchorState.ANCHORED;
      this.dropAnchor(this.anchorCoordinates, radius);
    } else {
      const bowPos = GeoMath.calculateBowCoordinates(this.currentCoordinates, this.heading, this.boatConfig.gpsBowXDistance, this.boatConfig.gpsBowYDistance);
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

      this.fleetLayer.updateOwnPosition(this.currentCoordinates, this.heading);
      this.fleetLayer.appendOwnTrack(this.currentCoordinates);

      this.anchorOverlay.setBoatPosition(
        this.currentCoordinates, this.heading,
        this.boatConfig.gpsOffset,
      );
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
        bowHeight: this.boatConfig.anchorRollerHeight,
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
          // Flip state before dropAnchor so the overlay paints green.
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
    this.toolbar.setRadius(radius);
    this.anchorOverlay.setRadius(radius);
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

  dropAnchor(position, radius) {
    this.toolbar.setState(this.state);

    this.anchorCoordinates = position;

    this.scopePanel.hide();
    this.infoPanel.show();

    this.maxRadius = parseInt(radius, 10);
    if (this.maxRadius <= 0)
      this.maxRadius = 20;

    this.anchorOverlay.drop(position, this.maxRadius);
    this.toolbar.setRadius(this.maxRadius);
  }

  raiseAnchor() {
    this.toolbar.setState(this.state);

    this.infoPanel.hide();
    this.scopePanel.show();

    this.anchorOverlay.raise(this.anchorCoordinates);
  }

  // === Calculations ================================================================

  calculateScope(scope, dbs) {
    let maxHeight = dbs;
    maxHeight += this.boatConfig.anchorRollerHeight; // height of the bow roller
    maxHeight += this.tidalRise;              // delta to high tide
    return maxHeight * scope;
  }
}

$(() => AnchorAlarm.startup());
