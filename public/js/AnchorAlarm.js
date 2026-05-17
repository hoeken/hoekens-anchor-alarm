// AnchorAlarm is the composition root: it owns boat geometry and the polling
// lifecycle, delegates rendering to FleetLayer (vessels + tracks) and the four
// HudPanels (Info/Scope/Wind/Home), and hands the anchor state machine to
// AnchorController.

const POLL_INTERVAL_MS = 1000;
const FLEET_POLL_INTERVAL_MS = 5000;
const INITIAL_LOAD_RETRY_MS = 5000;

class AnchorAlarm {

  constructor() {
    this.signalK = new SignalKClient({ pluginName: 'hoekens-anchor-alarm' });

    this.heading = undefined;
    this.currentCoordinates = undefined;
    this.filterRadius = 500;

    this.twa = null;
    this.aws = null;

    this.boatConfig = undefined;
    this.tidalRise = 0;
    this.tidalFall = 0;

    this.map = undefined;
    this.fleetLayer = undefined;
    this.anchorOverlay = undefined;
    this.anchorController = undefined;

    this.infoPanel = undefined;
    this.scopePanel = undefined;
    this.windPanel = undefined;
    this.homeButton = undefined;
    this.toolbar = undefined;

    this.pollTimer = null;
    this.fleetTimer = null;
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
      parent: document.getElementById('map_container'),
      getMapContainer: () => this.map && this.map.getContainer(),
      onRaise: () => this.anchorController.requestRaise(),
      onDrop: () => this.anchorController.requestDrop(),
      onSetRadius: (newRadius) => this.anchorController.setRadius(newRadius),
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

      this.currentCoordinates = this.extractStartPosition(data);
      this.buildMap(this.currentCoordinates);

      this.paintInitialReadings(belowSurface, belowKeel, data);

      this.heading = this.computeInitialHeading(data);

      this.fleetLayer = new FleetLayer({ map: this.map, ownMmsi: this.boatConfig.mmsi });
      this.fleetLayer.setOwnVessel(this.currentCoordinates, this.heading, this.boatConfig);

      this.placeAnchorWidgets();
      this.restoreAnchorState(data);

      this.map.fitBounds(this.anchorOverlay.getBounds());

      this.signalK.fetchTracks(this.filterRadius).done((tracks) => {
        this.fleetLayer.loadHistoricalTracks(tracks, this.currentCoordinates, this.filterRadius);
      });

      this.pollTimer = setInterval(() => this.pollSelf(), POLL_INTERVAL_MS);
      this.fleetTimer = setInterval(() => this.pollFleet(), FLEET_POLL_INTERVAL_MS);
      this.pollFleet();
    }).fail((response) => {
      const msg = `Failed to load initial data: ${response.status} ${response.statusText}`;
      console.error(msg);
      this.statusBar?.setError(msg);
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
    return r;
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
        if (this.anchorController.state === AnchorState.UP) this.estimateAnchorPosition();
        map.fitBounds(this.anchorOverlay.getBounds());
      }
    });
    this.map.addControl(this.homeButton);

    L.control.layers(this.baseMaps, {}, { position: 'topright' }).addTo(this.map);

    this.statusBar = new StatusBar();
    SignalKClient.errorHandler = (msg) => this.statusBar.setWarning(msg);
    this.infoPanel = new InfoPanel();
    this.scopePanel = new ScopePanel();
    this.windPanel = new WindPanel();

    this.map.addControl(this.statusBar);
    this.map.addControl(this.infoPanel);
    this.map.addControl(this.scopePanel);
    this.map.addControl(this.windPanel);
  }

  paintInitialReadings(belowSurface, belowKeel, data) {
    this.paintDepth(belowSurface, belowKeel);

    const speedApparent = SignalKClient.freshValue(data, 'environment.wind.speedApparent');
    if (speedApparent !== undefined) this.windPanel.setSpeed(speedApparent, this.twa);
    if (this.twa !== null) this.windPanel.setAngle(this.twa);
  }

  paintDepth(belowSurface, belowKeel) {
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
  }

  // Heading priority: SignalK headingTrue > bearing-to-anchor (if dropped) >
  // last-known TWA > 0.
  computeInitialHeading(data) {
    const nav = data.navigation;
    let heading = SignalKClient.value(nav, 'headingTrue');
    const initialAnchorPos = SignalKClient.value(nav, 'anchor.position');

    if (heading != null) return GeoMath.rad2deg(heading);

    if (initialAnchorPos) {
      return Math.round(GeoMath.calculateBearing(
        this.currentCoordinates.lat, this.currentCoordinates.lng,
        initialAnchorPos.latitude, initialAnchorPos.longitude,
      ));
    }

    return this.twa ?? 0;
  }

  placeAnchorWidgets() {
    this.anchorOverlay = new AnchorOverlay({ map: this.map, radius: 0 })
      .setBoatPosition(this.currentCoordinates, this.heading, this.boatConfig.gpsOffset);

    this.anchorController = new AnchorController({
      overlay: this.anchorOverlay,
      toolbar: this.toolbar,
      signalK: this.signalK,
      infoPanel: this.infoPanel,
      scopePanel: this.scopePanel,
    });

    this.anchorOverlay.onCrosshairDrag((pos) => this.anchorController.updateCrosshairPosition(pos));
  }

  restoreAnchorState(data) {
    const nav = data.navigation;
    const initialAnchorPos = SignalKClient.value(nav, 'anchor.position');

    if (initialAnchorPos) {
      const pos = L.latLng(initialAnchorPos.latitude, initialAnchorPos.longitude);
      const radius = parseInt(SignalKClient.value(nav, 'anchor.maxRadius'), 10);
      this.anchorController.restoreDropped(pos, radius);
    } else {
      this.estimateAnchorPosition();
    }
  }

  estimateAnchorPosition() {
    const distance = this.scopePanel.getScope(5);
    this.anchorController.setRadius(this.computeDefaultRadius(distance));
    const bow = GeoMath.calculateBowCoordinates(this.currentCoordinates, this.heading, this.boatConfig.gpsBowXDistance, this.boatConfig.gpsBowYDistance);
    const guess = GeoMath.calculateDestinationPoint(bow.lat, bow.lng, this.heading, distance);
    this.anchorController.restoreRaised(L.latLng(guess.latitude, guess.longitude));
  }

  // === Live polling ================================================================

  // One GET of vessels/self per tick feeds position, depth, wind, anchor state,
  // and the anchor alarm — they're all subtrees of the same document. The fleet
  // poll runs on its own slower timer.
  pollSelf() {
    this.signalK.fetchSelf().done((data) => {
      this.updatePosition(data.navigation);
      this.updateAnchorStatus(SignalKClient.extract(data, 'notifications.navigation.anchor'));
      this.updateDepth(SignalKClient.extract(data, 'environment.depth'));
      this.updateWind(SignalKClient.extract(data, 'environment.wind'));
      this.updateAnchorReconcile(SignalKClient.extract(data, 'navigation.anchor'));
    });
  }

  updatePosition(nav) {
    if (!nav) return;

    const position = SignalKClient.freshValue(nav, 'position');
    if (!position) return;
    if (position.latitude === null || position.longitude === null) {
      const msg = `Invalid Signal K value at position: ${JSON.stringify(position)}`;
      console.warn(msg);
      this.statusBar.setWarning(msg);
      return;
    }

    this.currentCoordinates = L.latLng(position.latitude, position.longitude);

    const headingTrue = SignalKClient.freshValue(nav, 'headingTrue');
    if (headingTrue !== undefined) {
      this.heading = GeoMath.rad2deg(headingTrue);
    } else {
      // No live heading — point at the anchor instead.
      const anchor = this.anchorController.anchorCoordinates;
      this.heading = Math.round(GeoMath.calculateBearing(
        this.currentCoordinates.lat, this.currentCoordinates.lng,
        anchor.lat, anchor.lng,
      ));
    }

    this.fleetLayer.updateOwnPosition(this.currentCoordinates, this.heading);
    this.fleetLayer.appendOwnTrack(this.currentCoordinates);

    this.anchorOverlay.setBoatPosition(
      this.currentCoordinates, this.heading,
      this.boatConfig.gpsOffset,
    );
  }

  updateAnchorStatus(alarm) {
    const v = SignalKClient.value(alarm);
    if (!v) return;
    this.infoPanel.setStatus(v.message, v.state);
  }

  updateDepth(depth) {
    if (!depth) return;
    const belowSurface = SignalKClient.freshValue(depth, 'belowSurface');
    if (belowSurface === undefined) return;
    const belowKeel = SignalKClient.freshValue(depth, 'belowKeel', { fallback: 0 });

    this.paintDepth(belowSurface, belowKeel);
  }

  updateWind(wind) {
    if (!wind) return;

    const speedApparent = SignalKClient.freshValue(wind, 'speedApparent');
    if (speedApparent !== undefined) {
      this.aws = speedApparent;
      this.windPanel.setSpeed(speedApparent, this.twa);
    }

    const directionTrue = SignalKClient.freshValue(wind, 'directionTrue');
    if (directionTrue !== undefined) {
      this.twa = GeoMath.rad2deg(directionTrue);
      this.windPanel.setAngle(this.twa);
    }
  }

  updateAnchorReconcile(anchorStatus) {
    if (!anchorStatus) return;
    const on = SignalKClient.value(anchorStatus, 'state') === 'on';
    let position = null;
    if (on) {
      const p = SignalKClient.value(anchorStatus, 'position');
      if (p) position = L.latLng(p.latitude, p.longitude);
    }
    const maxRadius = SignalKClient.value(anchorStatus, 'maxRadius');

    this.anchorController.reconcile({ on, position, maxRadius });
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

  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.fleetTimer) {
      clearInterval(this.fleetTimer);
      this.fleetTimer = null;
    }
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
