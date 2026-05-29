// AnchorAlarm is the composition root: it owns boat geometry and the polling
// lifecycle, delegates rendering to FleetLayer (vessels + tracks) and the four
// HudPanels (Info/Scope/Wind/Home), and hands the anchor state machine to
// AnchorController.

import { Client } from "@signalk/client";
import { SignalKHelper } from "./SignalKHelper.js";
import { AppState } from "./AppState.js";
import { FleetLayer } from "./hud/FleetLayer.js";
import { StatusBar } from "./hud/StatusBar.js";
import { HomeButtonControl } from "./hud/HomeButtonControl.js";
import { InfoPanel } from "./hud/InfoPanel.js";
import { TidePanel } from "./hud/TidePanel.js";
import { WindPanel } from "./hud/WindPanel.js";
import { ScopePanel } from "./hud/ScopePanel.js";
import { StaleReloader } from "./StaleReloader.js";
import { AnchorOverlay } from "./hud/AnchorOverlay.js";
import { AnchorController } from "./AnchorController.js";
import { ControlToolbar } from "./hud/ControlToolbar.js";
import { ConfigPanel } from "./hud/ConfigPanel.js";

const UPDATE_INTERVAL_MS = 500;
const POLL_INTERVAL_MS = 1000;
const INITIAL_LOAD_RETRY_MS = 5000;

class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKHelper({ pluginName: "hoekens-anchor-alarm" });
    this.state = new AppState();
    this.config = {
      connectionType: "WEBSOCKET",
      fleetFilterRadius: 500,
      defaultBasemap: "Satellite",
      defaultShape: "circle",
      enableTidePanel: true,
      enableWindPanel: true,
      enableScopePanel: true,
    };
    this.state.loggedIn = false;

    this.map = undefined;
    this.fleetLayer = undefined;
    this.anchorOverlay = undefined;
    this.anchorController = undefined;
    this.infoPanel = undefined;
    this.tidePanel = undefined;
    this.scopePanel = undefined;
    this.windPanel = undefined;
    this.homeButton = undefined;
    this.configPanel = undefined;
    this.toolbar = undefined;
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
      autoConnect: false,
      notifications: true,
    });
    this.client.on("delta", (delta) => this.handleDeltas(delta));
    this.client.on("connect", () => this.state.websocketSubscribe(this.client));
    this.client.connect();
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
    this.map = L.map("map", {
      zoomControl: false,
      attributionControl: false, // Prevents the default bottom-right control
    }).setView([0, 0], 5);
    this.statusBar = new StatusBar();
    this.map.addControl(this.statusBar);

    this.toolbar = new ControlToolbar({
      parent: document.getElementById("map_container"),
      getMapContainer: () => this.map && this.map.getContainer(),
      onRaise: () => this.anchorController.requestRaise(),
      onDrop: () => this.anchorController.requestDrop(),
      onSetZone: (zoneConfig) => this.anchorController.setZone(zoneConfig),
    });

    this.signalK
      .fetchPluginInfo()
      .then((info) => {
        this.version = info.version;
        console.log(`Hoeken's Anchor Alarm v${this.version}`);
      })
      .catch(() => { });

    this.loadInitialData();
  }

  // === Initial load (one /self call, broken into phases) ===========================

  loadInitialData() {
    this.signalK
      .fetchSelf()
      .then(async (data) => {
        this.statusBar.clear("initial-load");

        this.state.extractAll(data);
        this.state.calculate();
        console.log("App State:", this.state);

        if (!this.state.currentCoordinates) {
          this.statusBar.update(this.state);
          setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
          return;
        }

        await this.loadConfig();
        console.log("UI Config:", this.config);

        this.setupConnection();
        this.buildMap();

        this.anchorController.estimateAnchorPosition();
        this.updateMap();
        this.map.fitBounds(this.anchorOverlay.getBounds());
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const status = error.status ? `${error.status} ` : "";
        const msg = `Failed to load initial data: ${status}${detail}`;

        this.statusBar.set("initial-load", msg, "error");
        console.error(msg, error);
        setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
      });
  }

  // Config fetch is independent: a 401 (user not logged in) must not block
  // startup, so on failure we keep the defaults and start pollers anyway.
  async loadConfig() {
    try {
      this.config = await this.signalK.fetchConfig();
      this.state.loggedIn = true;
    } catch (error) {
      console.error("Failed to load config, using defaults", error);
      this.state.loggedIn = false;
    }
  }

  // Persist UI settings edited via the ConfigPanel. We merge into the live
  // config and re-render immediately so panel-visibility toggles take effect
  // without a reload; settings that can't be applied live (basemap, shape,
  // fleet radius, connection type) are flagged in the dialog and pick up on
  // the next load. Returns the save promise so the dialog can report status.
  saveConfig(newConfig) {
    Object.assign(this.config, newConfig);
    this.updateMap();
    this.statusBar.clear("config-save");
    return this.signalK.saveConfig(newConfig).catch((error) => {
      const detail = error.statusText || error.message || "unknown error";
      const status = error.status ? `${error.status} ` : "";
      const msg = `Failed to save config: ${status}${detail}`;
      this.statusBar.set("config-save", msg, "error");
      console.error(msg, error);
      throw error;
    });
  }

  setupConnection() {
    if (this.config.connectionType === "WEBSOCKET") {
      console.log("Using Websockets");
      this.setupWebsockets();
      this.updateTimer = setInterval(
        () => this.update(),
        UPDATE_INTERVAL_MS,
      );
    } else {
      console.log("Using REST Polling");
      this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    }
  }

  // Decorates the map shell built in init() with the rest of the controls.
  // Splitting it this way lets the status bar exist before any data fetch.
  buildMap() {
    this.map.setView(this.state.getPosition(), 5);

    //actual map layer
    const layer =
      this.baseMaps[this.config.defaultBasemap] || this.satelliteLayer;
    layer.addTo(this.map);

    //
    // Buttons - Top Right
    //

    // Settings gear only makes sense when logged in — anonymous users can't
    // persist config (the POST is auth-gated server-side).
    if (this.state.loggedIn) {
      this.configPanel = new ConfigPanel({
        getConfig: () => this.config,
        getVersion: () => this.version,
        onChange: (newConfig) => this.saveConfig(newConfig),
      });
      this.map.addControl(this.configPanel);
    }

    this.homeButton = new HomeButtonControl({
      onHome: (map) => {
        this.anchorController.estimateAnchorPosition();
        map.fitBounds(this.anchorOverlay.getBounds());
      },
    });
    this.map.addControl(this.homeButton);

    L.control.zoom({ position: "topright" }).addTo(this.map);
    L.control.layers(this.baseMaps, {}, { position: "topleft" }).addTo(this.map);

    // Map attribution lives in a full-width strip at the bottom of the page
    // (#mapAttribution) instead of Leaflet's default corner control, which is
    // disabled. Refresh it whenever the active base layer changes.
    this.updateAttribution();
    this.map.on("baselayerchange", () => this.updateAttribution());
    window.addEventListener("resize", () => this.updateAttribution());

    // L.control.scale({ position: "bottomleft" }).addTo(this.map);

    //
    // Panels - Bottom Right
    //
    this.infoPanel = new InfoPanel();

    this.tidePanel = new TidePanel();
    if (this.config.enableTidePanel)
      this.tidePanel.show();
    else
      this.tidePanel.hide();

    this.windPanel = new WindPanel();
    if (this.config.enableWindPanel)
      this.windPanel.show();
    else
      this.windPanel.hide();

    this.scopePanel = new ScopePanel();
    if (this.config.enableScopePanel)
      this.scopePanel.show();
    else
      this.scopePanel.hide();

    this.map.addControl(this.infoPanel);
    this.map.addControl(this.tidePanel);
    this.map.addControl(this.scopePanel);

    this.map.addControl(this.windPanel);

    this.fleetLayer = new FleetLayer({
      app: this,
      map: this.map,
      ownMmsi: this.state.boatConfig.mmsi,
      filterRadius: this.config.fleetFilterRadius,
    });

    this.anchorOverlay = new AnchorOverlay({
      state: this.state,
      map: this.map,
      onZoneChange: (zoneConfig) => this.anchorController.setZone(zoneConfig),
      onZoneInput: (zoneConfig) => this.anchorController.previewZone(zoneConfig),
    });

    this.anchorController = new AnchorController({
      appState: this.state,
      overlay: this.anchorOverlay,
      signalK: this.signalK,
      statusBar: this.statusBar,
      defaultShape: this.config.defaultShape,
      onChange: () => this.updateMap(),
    });
  }

  // Gather attribution strings from the active layers and render them, with
  // the standard Leaflet credit, into the bottom-of-page attribution strip.
  updateAttribution() {
    const el = document.getElementById("mapAttribution");
    if (!el || !this.map)
      return;
    const parts = [];
    this.map.eachLayer((layer) => {
      const attr = layer.getAttribution && layer.getAttribution();
      if (attr && parts.indexOf(attr) === -1)
        parts.push(attr);
    });
    const prefix = `<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>`;
    el.innerHTML = [prefix, ...parts].join(" | ");

    // Expose the strip's rendered height so bottom-anchored Leaflet controls
    // (see .leaflet-bottom in style.css) can sit above it. The height varies
    // with text wrapping, so measure after the content is set.
    document.documentElement.style.setProperty(
      "--attributionHeight",
      `${el.offsetHeight}px`,
    );
  }

  updateMap() {
    const anchored = this.state.isAnchored();

    this.toolbar.update(this.state);
    this.statusBar.update(this.state);
    this.anchorOverlay.update(this.state);
    this.fleetLayer.update(this.state);

    // Tide/info live in the bottom-right while anchored; the scope panel
    // takes the same slot when the anchor is up. Config flags gate each
    // optional box; the panels themselves still hide on missing data.

    if (anchored) {
      this.infoPanel.update(this.state);
      this.scopePanel.hide();
    } else {
      this.infoPanel.hide();
      if (this.config.enableScopePanel)
        this.scopePanel.update(this.state);
      else
        this.scopePanel.hide();
    }

    //always show tide if enabled
    if (this.config.enableTidePanel)
      this.tidePanel.update(this.state);
    else
      this.tidePanel.hide();

    //always show wind if enabled
    if (this.config.enableWindPanel)
      this.windPanel.update(this.state);
    else
      this.windPanel.hide();
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
        this.statusBar.clear("self-poll");
        this.state.extractAll(data);
        this.state.calculate();
        this.updateMap();
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const status = error.status ? `${error.status} ` : "";
        const msg = `Self update failed: ${status}${detail}`;
        this.statusBar.set("self-poll", msg, "warning");
        console.error(msg, error);
      })
      .finally(() => {
        this._pollInFlight = false;
      });
  }

  update() {
    try {
      this.state.calculate();
      this.updateMap();
      this.statusBar.clear("update");
    } catch (error) {
      const detail = error.statusText || error.message || "unknown error";
      const status = error.status ? `${error.status} ` : "";
      const msg = `Update failed: ${status}${detail}`;
      this.statusBar.set("update", msg, "warning");
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
