// AnchorAlarm is the composition root: it owns boat geometry and the polling
// lifecycle, delegates rendering to FleetLayer (vessels + tracks) and the four
// HudPanels (Info/Scope/Wind/Home), and hands the anchor state machine to
// AnchorController.

import Client from "@signalk/client";
import { SignalKHelper } from "./SignalKHelper.js";
import { AppState } from "./AppState.js";
import { FleetLayer } from "./hud/FleetLayer.js";
import { StatusBar } from "./hud/StatusBar.js";
import { HomeButtonControl } from "./hud/HomeButtonControl.js";
import { InfoPanel } from "./hud/InfoPanel.js";
import { WindPanel } from "./hud/WindPanel.js";
import { ScopePanel } from "./hud/ScopePanel.js";
import { StaleReloader } from "./StaleReloader.js";
import { AnchorOverlay } from "./hud/AnchorOverlay.js";
import { AnchorController } from "./AnchorController.js";
import { ControlToolbar } from "./hud/ControlToolbar.js";

const UPDATE_INTERVAL_MS = 500;
const POLL_INTERVAL_MS = 1000;
const INITIAL_LOAD_RETRY_MS = 5000;

class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKHelper({ pluginName: "hoekens-anchor-alarm" });
    this.state = new AppState();

    this.map = undefined;
    this.fleetLayer = undefined;
    this.anchorOverlay = undefined;
    this.anchorController = undefined;
    this.infoPanel = undefined;
    this.scopePanel = undefined;
    this.windPanel = undefined;
    this.homeButton = undefined;
    this.toolbar = undefined;

    this.useWebsockets = true;

    this.updateTimer = null;
    this.pollTimer = null;
    this._pollInFlight = false;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  setupWebsockets() {
    this.client = new Client({
      hostname: window.location.hostname,
      port:
        Number(window.location.port) ||
        (window.location.protocol === "https:" ? 443 : 80),
      useTLS: window.location.protocol === "https:",
      reconnect: true,
      autoConnect: true,
      notifications: true,
      sendMeta: true,
    });
    this.client.on("connect", () => this.state.websocketSubscribe(this.client));
    this.client.on("delta", (delta) => this.handleDeltas(delta));
  }

  handleDeltas(delta) {
    if (delta.updates) {
      for (const update of delta.updates) {
        if (update.values) {
          let timestamp = update.timestamp;
          for (const value of update.values) {
            this.state.handleDelta(timestamp, value);
          }
        }
      }
    }
  }

  init() {
    if (this.useWebsockets) {
      console.log("Using Websockets");
      this.setupWebsockets();
    } else {
      console.log("Using REST Polling");
    }

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
    SignalKHelper.errorHandler = (msg) => this.statusBar.setWarning(msg);

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

        console.log(this.state);

        this.buildMap();
        this.checkFreshness();
        this.updateMap();
        this.map.fitBounds(this.anchorOverlay.getBounds());

        if (this.useWebsockets)
          this.updateTimer = setInterval(
            () => this.update(),
            UPDATE_INTERVAL_MS,
          );
        else
          this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
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
        this.anchorController.estimateAnchorPosition();
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
      app: this,
      map: this.map,
      ownMmsi: this.state.boatConfig.mmsi,
    });

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
      appState: this.state,
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
    this.anchorController.reconcile();
    this.anchorOverlay.update(this.state);
    this.fleetLayer.update(this.state);
  }

  checkFreshness() {
    if (SignalKHelper.isStale(this.state.currentCoordinates))
      this.statusBar.setError("Current Position data is stale.");
    if (SignalKHelper.isStale(this.state.heading))
      this.statusBar.setError("Heading data is stale.");
    if (SignalKHelper.isStale(this.state.belowKeel))
      this.statusBar.setError("Depth Below Keel data is stale.");
    if (SignalKHelper.isStale(this.state.belowSurface))
      this.statusBar.setError("Depth Below Surface data is stale.");
    if (SignalKHelper.isStale(this.state.twa))
      this.statusBar.setError("True Wind Angle data is stale.");
    if (SignalKHelper.isStale(this.state.aws))
      this.statusBar.setError("Apparent Wind Speed data is stale.");
  }

  // === Live polling ================================================================

  // One GET of vessels/self per tick feeds position, depth, wind, anchor state,
  // and the anchor alarm — they're all subtrees of the same document. The fleet
  // poll runs on its own slower timer.
  poll() {
    // Skip the tick if the previous fetch is still in flight; otherwise a slow
    // response can land after a newer one and stomp fresher state.
    if (this._pollInFlight)
      return;
    this._pollInFlight = true;

    this.signalK
      .fetchSelf()
      .then((data) => {
        this.state.extractAll(data);
        this.state.calculate();
        this.checkFreshness();
        this.updateMap();
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const status = error.status ? `${error.status} ` : "";
        const msg = `Self update failed: ${status}${detail}`;

        this.statusBar.setWarning(msg);
        console.error(msg, error);
      })
      .finally(() => {
        this._pollInFlight = false;
      });
  }

  update() {
    try {
      this.state.calculate();
      this.checkFreshness();
      this.updateMap();
    } catch (error) {
      const detail = error.statusText || error.message || "unknown error";
      const status = error.status ? `${error.status} ` : "";
      const msg = `Update failed: ${status}${detail}`;

      this.statusBar.setWarning(msg);
      console.error(msg, error);
    }
  }

  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

AnchorAlarm.startup();
