// AnchorAlarm is the composition root: it owns boat geometry and the polling
// lifecycle, delegates rendering to FleetLayer (vessels + tracks) and the four
// HudPanels (Info/Scope/Wind/Home), and hands the anchor state machine to
// AnchorController.

import { SignalKClient } from "./SignalKClient.js";
import { AppState } from "./AppState.js";
import { FleetLayer } from "./FleetLayer.js";
import {
  StatusBar,
  HomeButtonControl,
  InfoPanel,
  WindPanel,
  ScopePanel,
} from "./HudPanels.js";
import { StaleReloader } from "./StaleReloader.js";
import { AnchorOverlay } from "./AnchorOverlay.js";
import { AnchorController } from "./AnchorController.js";
import { ControlToolbar } from "./ControlToolbar.js";

const POLL_INTERVAL_MS = 1000;
const FLEET_POLL_INTERVAL_MS = 5000;
const INITIAL_LOAD_RETRY_MS = 5000;

class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKClient({ pluginName: "hoekens-anchor-alarm" });
    this.state = new AppState();

    this.filterRadius = 500;

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
    this._pollSelfInFlight = false;
    this._pollFleetInFlight = false;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  init() {
    new StaleReloader({ staleThresholdMs: 5 * 60 * 1000 }).start();

    this.satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        maxZoom: 23,
        maxNativeZoom: 17, // Highest zoom level Esri has real imagery for
        tileSize: 256,
        noWrap: true,
        keepBuffer: 5,
      },
    );

    this.osmLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "Map data from OpenStreetMap (OSM)",
        maxZoom: 23,
      },
    );

    this.baseMaps = {
      OpenStreetMap: this.osmLayer,
      Satellite: this.satelliteLayer,
    };

    // Map shell and status bar first so failures during initial load (missing
    // GPS, server unreachable, etc.) have somewhere to surface.
    this.map = L.map("map", { zoomControl: false }).setView([0, 0], 5);
    this.statusBar = new StatusBar();
    this.map.addControl(this.statusBar);
    SignalKClient.errorHandler = (msg) => this.statusBar.setWarning(msg);

    this.toolbar = new ControlToolbar({
      parent: document.getElementById("map_container"),
      getMapContainer: () => this.map && this.map.getContainer(),
      onRaise: () => this.anchorController.requestRaise(),
      onDrop: () => this.anchorController.requestDrop(),
      onSetRadius: (newRadius) => this.anchorController.setRadius(newRadius),
    });

    this.loadInitialData();
  }

  // === Initial load (one /self call, broken into phases) ===========================

  loadInitialData() {
    this.signalK
      .fetchSelf()
      .then((data) => {
        this.state.extractAll(data);

        if (!this.state.currentCoordinates) {
          this.statusBar.setError("Waiting for GPS position...");
          setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
          return;
        }

        this.state.calculate();

        this.buildMap();
        this.updateMap();
        this.map.fitBounds(this.anchorOverlay.getBounds());

        this.pollTimer = setInterval(() => this.pollSelf(), POLL_INTERVAL_MS);

        //todo: move this to fleet layer
        this.signalK
          .fetchTracks(this.filterRadius)
          .then((tracks) => {
            this.fleetLayer.loadHistoricalTracks(
              tracks,
              this.state.getPosition(),
              this.filterRadius,
            );
          })
          .catch((err) => {
            const detail = err.statusText || err.message || "unknown error";
            this.statusBar.setWarning(`Tracks plugin not available: ${detail}`);
          });

        //todo: move this to fleet layer
        this.fleetTimer = setInterval(
          () => this.pollFleet(),
          FLEET_POLL_INTERVAL_MS,
        );
        this.pollFleet();
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const status = error.status ? `${error.status} ` : "";
        const msg = `Failed to load initial data: ${status}${detail}`;

        this.statusBar.setError(msg);
        console.error(msg, error);

        setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
      });
  }

  // Decorates the map shell built in init() with the rest of the controls.
  // Splitting it this way lets the status bar exist before any data fetch.
  buildMap() {
    this.map.setView(this.state.getPosition(), 5);

    this.satelliteLayer.addTo(this.map);

    L.control.zoom({ position: "topright" }).addTo(this.map);

    this.homeButton = new HomeButtonControl({
      onHome: (map) => {
        this.anchorController.estimateAnchorPosition(this.state);
        map.fitBounds(this.anchorOverlay.getBounds());
      },
    });
    this.map.addControl(this.homeButton);

    L.control
      .layers(this.baseMaps, {}, { position: "topright" })
      .addTo(this.map);

    this.infoPanel = new InfoPanel();
    this.scopePanel = new ScopePanel();
    this.windPanel = new WindPanel();

    this.map.addControl(this.infoPanel);
    this.map.addControl(this.scopePanel);
    this.map.addControl(this.windPanel);

    L.control.scale({ position: "topleft" }).addTo(this.map);

    this.fleetLayer = new FleetLayer({
      map: this.map,
      ownMmsi: this.state.boatConfig.mmsi,
    });
    this.fleetLayer.setOwnVessel(
      this.state.getPosition(),
      this.state.boatConfig,
    );

    this.buildAnchorWidgets();
  }

  buildAnchorWidgets() {
    this.anchorOverlay = new AnchorOverlay({
      map: this.map,
      radius: 0,
    }).setBoatPosition(
      this.state.getPosition(),
      this.state.boatConfig.heading,
      this.state.boatConfig.gpsOffset,
    );

    this.anchorController = new AnchorController({
      overlay: this.anchorOverlay,
      toolbar: this.toolbar,
      signalK: this.signalK,
      infoPanel: this.infoPanel,
      scopePanel: this.scopePanel,
      onError: (msg) => this.statusBar.setError(msg),
    });

    this.anchorOverlay.onCrosshairDrag((pos) =>
      this.anchorController.updateCrosshairPosition(pos),
    );

    this.anchorController.estimateAnchorPosition();
  }

  updateMap() {
    this.windPanel.update(this.state);
    this.infoPanel.update(this.state);
    this.scopePanel.update(this.state);
    this.anchorController.reconcile(this.state);
    this.anchorOverlay.update(this.state);
    this.fleetLayer.update(this.state);
  }

  // === Live polling ================================================================

  // One GET of vessels/self per tick feeds position, depth, wind, anchor state,
  // and the anchor alarm — they're all subtrees of the same document. The fleet
  // poll runs on its own slower timer.
  pollSelf() {
    // Skip the tick if the previous fetch is still in flight; otherwise a slow
    // response can land after a newer one and stomp fresher state.
    if (this._pollSelfInFlight) return;
    this._pollSelfInFlight = true;

    this.signalK
      .fetchSelf()
      .then((data) => {
        this.state.extractAll(data);
        this.state.calculate();
        this.updateMap();
      })
      .catch((err) => {
        const detail = err.statusText || err.message || "unknown error";
        this.statusBar.setWarning(`Self update failed: ${detail}`);
      })
      .finally(() => {
        this._pollSelfInFlight = false;
      });
  }

  //todo: move to fleetlayer
  pollFleet() {
    if (this._pollFleetInFlight) return;
    this._pollFleetInFlight = true;
    this.signalK
      .fetchAllVessels()
      .then((vessels) => {
        this.fleetLayer.syncOtherVessels(vessels, {
          ownLatLng: this.state.getPosition(),
          filterRadius: this.filterRadius,
          twa: this.twa,
        });
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const status = error.status ? `${error.status} ` : "";
        const msg = `Fleet update failed: ${status}${detail}`;

        this.statusBar.setWarning(msg);
        console.error(msg, error);
      })
      .finally(() => {
        this._pollFleetInFlight = false;
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
}

AnchorAlarm.startup();
