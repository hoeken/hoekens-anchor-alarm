// AnchorAlarm is the composition root: it owns boat geometry and the polling
// lifecycle, delegates rendering to FleetLayer (vessels + tracks) and the four
// HudPanels (Info/Scope/Wind/Home), and hands the anchor state machine to
// AnchorController.

import { SignalKStream } from "./SignalKStream.js";
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
import { Modal } from "./hud/Modal.js";
import { nativeTooltipsSuppressed } from "./BrowserSupport.js";

const UPDATE_INTERVAL_MS = 500;
const POLL_INTERVAL_MS = 1000;
const INITIAL_LOAD_RETRY_MS = 5000;

class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKHelper({ pluginName: "hoekens-anchor-alarm" });
    // A 401 on any auth-gated request (e.g. an expired session) pops the login
    // modal instead of bouncing to the SignalK admin login page.
    this.signalK.onUnauthorized = () => this.showLoginModal();
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
    this._loginModal = null;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  setupWebsockets() {
    this.client = new SignalKStream({
      hostname: window.location.hostname,
      port:
        Number(window.location.port) ||
        (window.location.protocol === "https:" ? 443 : 80),
      useTLS: window.location.protocol === "https:",
      reconnect: true,
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
      onLogin: () => this.showLoginModal(),
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

  // Log in to SignalK from within the app (replacing the old redirect to the
  // admin login SPA, which never returned on the Navico MFD). On success the
  // auth cookie is set and we reload, so startup re-fetches config as the
  // logged-in user and builds the full control set. Used by both the toolbar
  // Login button and the 401 handler, so guard against opening twice.
  showLoginModal() {
    if (this._loginModal && this._loginModal.isOpen())
      return;

    const modal = new Modal({ title: "Login" });
    this._loginModal = modal;

    const form = document.createElement("div");
    form.className = "modalForm";

    const userLabel = document.createElement("label");
    userLabel.className = "modalMessage";
    userLabel.textContent = "Username";
    const username = document.createElement("input");
    username.type = "text";
    username.className = "modalInput";
    username.setAttribute("autocomplete", "username");

    const passLabel = document.createElement("label");
    passLabel.className = "modalMessage";
    passLabel.textContent = "Password";
    const password = document.createElement("input");
    password.type = "password";
    password.className = "modalInput";
    password.setAttribute("autocomplete", "current-password");

    const rememberRow = document.createElement("label");
    rememberRow.className = "modalCheckbox";
    const rememberMe = document.createElement("input");
    rememberMe.type = "checkbox";
    rememberMe.checked = true;
    const rememberText = document.createElement("span");
    rememberText.textContent = "Remember me?";
    rememberRow.appendChild(rememberMe);
    rememberRow.appendChild(rememberText);

    form.appendChild(userLabel);
    form.appendChild(username);
    form.appendChild(passLabel);
    form.appendChild(password);
    form.appendChild(rememberRow);
    modal.setContent(form);

    modal.setButtons([
      { label: "Cancel", variant: "secondary", value: null },
      {
        label: "Login",
        variant: "primary",
        primary: true,
        onClick: async (m) => {
          const user = username.value.trim();
          const pass = password.value;
          if (!user || !pass) {
            m.setError("Enter your username and password.");
            return;
          }
          m.setError("");
          m.setBusy(true);
          try {
            await this.signalK.login(user, pass, rememberMe.checked);
            window.location.reload();
          } catch (err) {
            m.setBusy(false);
            m.setError(
              err && err.status === 401
                ? "Invalid username or password."
                : "Login failed. Please try again.",
            );
            password.select();
          }
        },
      },
    ]);
    modal.setFocusTarget(username);
    modal.open();
  }

  // Persist UI settings edited via the ConfigPanel. We merge into the live
  // config and re-render immediately so panel-visibility toggles and the
  // basemap take effect without a reload; settings that can't be applied live
  // (shape, fleet radius, connection type) are flagged in the dialog and pick
  // up on the next load. Returns the save promise so the dialog can report
  // status.
  saveConfig(newConfig) {
    Object.assign(this.config, newConfig);
    this.setBasemap(this.config.defaultBasemap);
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
    this.setBasemap(this.config.defaultBasemap);

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

  // Swap the active base layer to the named basemap (falling back to satellite
  // for an unknown name). No-op if it's already active; otherwise we remove any
  // other base layer first so the two never stack. The layer-control radio
  // tracks add/removeLayer on its own, but baselayerchange only fires on user
  // clicks in that control — so we refresh the attribution strip by hand.
  setBasemap(name) {
    const layer = this.baseMaps[name] || this.satelliteLayer;
    if (this.map.hasLayer(layer))
      return;
    for (const key in this.baseMaps) {
      const other = this.baseMaps[key];
      if (other !== layer && this.map.hasLayer(other))
        this.map.removeLayer(other);
    }
    layer.addTo(this.map);
    this.updateAttribution();
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
    const leafletTitle = nativeTooltipsSuppressed
      ? ""
      : ` title="A JavaScript library for interactive maps"`;
    const prefix = `<a href="https://leafletjs.com"${leafletTitle}>Leaflet</a>`;
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
