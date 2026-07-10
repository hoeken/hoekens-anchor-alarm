// AnchorAlarm is the composition root: it owns boat geometry and the live-update
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
import { loadSeascapeLayer } from "./SeascapeLoader.js";
import { loadChartLayers, CHART_PANE, CHART_PANE_Z_INDEX } from "./ChartLayers.js";
import { AnchorOverlay } from "./hud/AnchorOverlay.js";
import { AnchorController } from "./AnchorController.js";
import { ControlToolbar } from "./hud/ControlToolbar.js";
import { ConfigPanel } from "./hud/ConfigPanel.js";
import { ThemeControl } from "./hud/ThemeControl.js";
import { Modal } from "./hud/Modal.js";
import { nativeTooltipsSuppressed, isNavicoMfd } from "./BrowserSupport.js";

const UPDATE_INTERVAL_MS = 500;
const INITIAL_LOAD_RETRY_MS = 5000;

// Stacking order for the Seascape bathymetry overlay, whose GL canvas shares the
// Leaflet tile pane with the base tiles. It sits above the base tiles but stays
// below the local raster charts, which draw in their own higher pane (see
// CHART_PANE in ChartLayers) so a more detailed local chart always stays legible
// on top of the broad depth shading.
const SEASCAPE_OVERLAY_Z_INDEX = 250;

// Build a stand-in wheel event whose scroll direction is flipped, forwarding the
// fields Leaflet's ScrollWheelZoom handler reads: the delta axes (negated) plus
// the cursor position and the two methods its internal stop() calls. Legacy
// delta fields are negated too so the flip holds on the older wheel-event shapes
// getWheelDelta falls back to. Used to reverse zoom direction on Navico MFDs;
// see AnchorAlarm.reverseScrollWheelZoom.
function negateWheelDelta(e) {
  return {
    deltaX: -e.deltaX,
    deltaY: -e.deltaY,
    deltaZ: e.deltaZ,
    deltaMode: e.deltaMode,
    wheelDelta: e.wheelDelta == null ? e.wheelDelta : -e.wheelDelta,
    wheelDeltaY: e.wheelDeltaY == null ? e.wheelDeltaY : -e.wheelDeltaY,
    detail: e.detail == null ? e.detail : -e.detail,
    clientX: e.clientX,
    clientY: e.clientY,
    preventDefault: () => e.preventDefault(),
    stopPropagation: () => e.stopPropagation(),
  };
}

class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKHelper({ pluginName: "hoekens-anchor-alarm" });
    // A 401 on any auth-gated request (e.g. an expired session) pops the login
    // modal instead of bouncing to the SignalK admin login page.
    this.signalK.onUnauthorized = () => this.showLoginModal();
    this.state = new AppState();
    this.config = {
      fleetFilterRadius: 500,
      defaultBasemap: "Satellite",
      defaultShape: "circle",
      enableTidePanel: true,
      enableWindPanel: true,
      enableScopePanel: true,
      enableBoatLabels: true,
      enableChartLayers: true,
      enableSeascape: false,
      scopes: "7,5,4,3",
      hasCustomIcon: false,
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
    this.themeControl = undefined;
    this.toolbar = undefined;
    // Startup snapshot of the local raster charts (see addChartLayers). Every
    // later add/remove works off this copy so we never re-fetch the catalog.
    this.chartLayers = [];
    this.updateTimer = null;
    this._loginModal = null;
    // Own-boat stream context, learned from the hello frame. Used to route each
    // delta to either own-boat state or the fleet layer once we subscribe to
    // both vessels.self and vessels.*.
    this.selfContext = null;
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
    this.client.on("hello", (hello) => {
      this.selfContext = this.normalizeContext(hello.self);
    });
    this.client.on("delta", (delta) => this.handleDeltas(delta));
    this.client.on("connect", () => {
      this.state.websocketSubscribe(this.client);
      this.state.websocketSubscribeFleet(this.client);
      // The server drops every subscription when the socket closes, so replay
      // the per-vessel context subscriptions to keep static identity streaming
      // after a reconnect. On the first connect this also sends any that
      // subscribeVessel queued before the socket finished opening.
      this.fleetLayer?.resubscribeVessels();
    });
    this.client.connect();
  }

  // Normalize a stream identity to the "vessels.<id>" form deltas use as their
  // context, so hello.self and delta.context compare directly.
  normalizeContext(id) {
    if (!id)
      return null;
    return id.startsWith("vessels.") ? id : `vessels.${id}`;
  }

  // Route each delta by its context: own-boat updates feed AppState; every other
  // vessel's dynamic paths feed the fleet layer's cache. A delta with no context
  // predates the hello (own-boat only at that point), so it's treated as self.
  handleDeltas(delta) {
    if (!delta.updates)
      return;
    const isSelf = !delta.context || delta.context === this.selfContext;
    for (const update of delta.updates) {
      if (!update.values)
        continue;
      const timestamp = update.timestamp;
      if (isSelf) {
        for (const value of update.values)
          this.state.handleDelta(timestamp, value);
      } else if (this.fleetLayer) {
        this.fleetLayer.ingestVesselDelta(delta.context, timestamp, update.values);
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

    // An empty base layer for boats offline or on slow links, and for crews who
    // rely solely on their own local charts (see ChartLayers): selecting it
    // fetches no tiles at all, leaving just the themed .leaflet-container
    // background (light grey / dark #1a1d21 — see style.css) with whatever chart
    // overlays are enabled drawn on top. It carries no attribution.
    this.blankLayer = L.layerGroup();

    this.baseMaps = {
      Blank: this.blankLayer,
      OpenStreetMap: this.osmLayer,
      Satellite: this.satelliteLayer,
    };

    // Map shell and status bar first so failures during initial load (missing
    // GPS, server unreachable, etc.) have somewhere to surface.
    this.map = L.map("map", {
      zoomControl: false,
      attributionControl: false, // Prevents the default bottom-right control
      worldCopyJump: true, // Wrap markers/view to nearest world copy past 180°
    }).setView([0, 0], 5);
    // Dedicated pane so local raster charts always draw above the base maps and
    // the Seascape overlay (both in the tile pane) while staying below the
    // anchor overlay and vessel markers. See CHART_PANE in ChartLayers.
    this.map.createPane(CHART_PANE).style.zIndex = CHART_PANE_Z_INDEX;
    // The Navico MFDs' rotary/scroll input reports wheel deltas backwards, so
    // scroll-to-zoom runs inverted on those consoles. Flip it back there only.
    if (isNavicoMfd())
      this.reverseScrollWheelZoom();
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

  // Reverse the map's scroll-wheel zoom direction, called on Navico MFDs where
  // the console's input reports wheel deltas with the opposite sign (see
  // isNavicoMfd). We wrap Leaflet's ScrollWheelZoom handler so it sees a
  // delta-negated stand-in event (negateWheelDelta), which keeps all of
  // Leaflet's own accumulation/rate-limiting intact and leaves control-panel
  // scrolling untouched. Leaflet registers its wheel listener against the
  // handler method captured by reference when its hooks are added (during map
  // construction), so a plain reassignment afterwards wouldn't take effect — we
  // disable()/enable() to re-register the listener against the wrapper. This
  // reaches into a Leaflet-internal method (_onWheelScroll); guard so a Leaflet
  // upgrade that renames it degrades to a no-op rather than throwing.
  reverseScrollWheelZoom() {
    const handler = this.map.scrollWheelZoom;
    if (
      !handler ||
      typeof handler._onWheelScroll !== "function" ||
      !handler.enabled()
    )
      return;
    const original = handler._onWheelScroll;
    handler.disable();
    handler._onWheelScroll = function (e) {
      original.call(this, negateWheelDelta(e));
    };
    handler.enable();
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

        // Apply the configured scope ratios and recompute so the first render
        // reflects them (state.calculate above ran with the defaults).
        this.state.setScopeRatios(this.config.scopes);
        this.state.calculateScopes();

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

  // Log out of SignalK, then reload so startup re-fetches config as an
  // anonymous user and rebuilds the control set without the logged-in-only
  // controls. Reachable from the Settings footer's "Log out" link. Returns the
  // request promise so the ConfigPanel can surface a failure inline (on success
  // the reload replaces the page before anything else runs).
  logout() {
    return this.signalK.logout().then(() => window.location.reload());
  }

  // Persist UI settings edited via the ConfigPanel. We merge into the live
  // config and re-render immediately so every setting takes effect without a
  // reload: panel toggles and basemap re-render here, while the default
  // watch-zone shape and fleet radius are pushed into the objects that captured
  // them at construction. Returns the save promise so the dialog can report
  // status.
  saveConfig(newConfig) {
    Object.assign(this.config, newConfig);
    // Scope ratios can change live; re-parse and recompute before re-rendering.
    this.state.setScopeRatios(this.config.scopes);
    this.state.calculateScopes();
    this.setBasemap(this.config.defaultBasemap);
    this.setSeascapeEnabled(this.config.enableSeascape);
    this.anchorController?.setDefaultShape(this.config.defaultShape);
    this.fleetLayer?.setFilterRadius(this.config.fleetFilterRadius);
    this.fleetLayer?.setShowLabels(this.config.enableBoatLabels);
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

  // Upload a custom own-boat icon, then live-update the marker (cache-busted so
  // the overwritten-in-place file refetches). Returns the request promise so the
  // settings dialog can report status; on failure the marker is left unchanged.
  uploadBoatIcon(file) {
    return this.signalK.uploadBoatIcon(file).then((result) => {
      this.config.hasCustomIcon = true;
      this.fleetLayer?.setOwnBoatIcon(this.signalK.boatIconUrl(Date.now()));
      return result;
    });
  }

  // Remove the custom icon and revert the marker to the AIS ship-type icon.
  deleteBoatIcon() {
    return this.signalK.deleteBoatIcon().then((result) => {
      this.config.hasCustomIcon = false;
      this.fleetLayer?.setOwnBoatIcon(null);
      return result;
    });
  }

  setupConnection() {
    this.setupWebsockets();
    this.updateTimer = setInterval(
      () => this.update(),
      UPDATE_INTERVAL_MS,
    );
  }

  // Decorates the map shell built in init() with the rest of the controls.
  // Splitting it this way lets the status bar exist before any data fetch.
  buildMap() {
    this.map.setView(this.state.getPosition(), 5);

    //actual map layer
    this.setBasemap(this.config.defaultBasemap);

    //
    // Buttons - Top Left
    //

    // The settings gear is always available: logged-in users open the config
    // dialog, while anonymous users' clicks go straight to the login modal
    // (the save POST is auth-gated server-side, so the dialog is useless to
    // them — see ConfigPanel). Login and logout both reload, so getLoggedIn is
    // effectively fixed per page load.
    this.configPanel = new ConfigPanel({
      getConfig: () => this.config,
      getVersion: () => this.version,
      getLoggedIn: () => this.state.loggedIn,
      onChange: (newConfig) => this.saveConfig(newConfig),
      onLogin: () => this.showLoginModal(),
      onLogout: () => this.logout(),
      getIconUrl: (bust) => this.signalK.boatIconUrl(bust),
      onUploadIcon: (file) => this.uploadBoatIcon(file),
      onDeleteIcon: () => this.deleteBoatIcon(),
    });
    this.map.addControl(this.configPanel);

    this.layersControl = L.control
      .layers(this.baseMaps, {}, { position: "topleft" })
      .addTo(this.map);
    this.addSeascapeLayer();
    this.addChartLayers();

    // Light/dark toggle. Unlike the settings gear it isn't login-gated — the
    // theme is a session-only preference anyone can flip (see hud/ThemeControl).
    this.themeControl = new ThemeControl();
    this.map.addControl(this.themeControl);

    //
    // Buttons - Top Right
    //
    this.homeButton = new HomeButtonControl({
      onHome: (map) => {
        this.anchorController.estimateAnchorPosition();
        map.fitBounds(this.anchorOverlay.getBounds());
      },
    });
    this.map.addControl(this.homeButton);

    L.control.zoom({ position: "topright" }).addTo(this.map);

    // Map attribution lives in a full-width strip at the bottom of the page
    // (#mapAttribution) instead of Leaflet's default corner control, which is
    // disabled. Refresh it whenever the active base layer changes.
    this.updateAttribution();
    this.map.on("baselayerchange", () => this.updateAttribution());
    // Toggling a chart overlay fires overlayadd/overlayremove (not
    // baselayerchange), so refresh here too or a chart's credit wouldn't appear.
    this.map.on("overlayadd", () => this.updateAttribution());
    this.map.on("overlayremove", () => this.updateAttribution());
    // Panning or zooming re-derives which local charts belong in the layer
    // control for the new view (moveend also fires after a zoom completes).
    this.map.on("moveend", () => this.updateChartLayers());
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
      showLabels: this.config.enableBoatLabels,
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

  // Seascape is a WebGL bathymetry chart (see SeascapeLoader) that shades the
  // water by depth and is transparent over land, so it belongs on top of a base
  // map as an overlay rather than replacing one. It loads asynchronously (or
  // never, on the Chromium 69 MFDs) and joins the layer control as a toggleable
  // overlay once ready, switched on at startup when config.enableSeascape. If it
  // can't load — offline or an unsupported engine — the selected base map simply
  // stays visible, so there's no fallback to handle.
  addSeascapeLayer() {
    loadSeascapeLayer().then((layer) => {
      if (!layer || !this.map)
        return;
      this.seascapeLayer = layer;
      // Its GL canvas is created on first add and lives in the tile pane; pin
      // the z-index on every add so switching base maps (which re-inserts base
      // tiles later in the DOM) can't bury it. See SEASCAPE_OVERLAY_Z_INDEX.
      layer.on("add", () => {
        const container = layer.getContainer && layer.getContainer();
        if (container)
          container.style.zIndex = SEASCAPE_OVERLAY_Z_INDEX;
      });
      this.layersControl?.addOverlay(layer, "Seascape Bathymetry");
      if (this.config.enableSeascape)
        layer.addTo(this.map);
    });
  }

  // Match the Seascape overlay to config.enableSeascape once it has loaded. A
  // no-op before the async load resolves or on engines where it never does —
  // addSeascapeLayer re-reads the flag when the layer finally arrives.
  setSeascapeEnabled(enabled) {
    const layer = this.seascapeLayer;
    if (!layer || !this.map)
      return;
    if (enabled && !this.map.hasLayer(layer))
      layer.addTo(this.map);
    else if (!enabled && this.map.hasLayer(layer))
      this.map.removeLayer(layer);
  }

  // Local raster charts served by SignalK's resources API (see ChartLayers) are
  // fetched once on startup and cached in this.chartLayers, keyed with the
  // coverage bounds and native min-zoom read back off each Leaflet layer. Every
  // later chart operation works off that snapshot instead of re-fetching. A
  // missing charts plugin or a fetch error resolves to an empty list, making
  // this a no-op then. updateChartLayers() populates the layer control for the
  // current view.
  addChartLayers() {
    loadChartLayers(this.signalK).then((charts) => {
      if (!this.map || !this.layersControl)
        return;
      this.chartLayers = charts.map(({ name, layer }) => ({
        name,
        layer,
        bounds: Array.isArray(layer.options.bounds)
          ? L.latLngBounds(layer.options.bounds)
          : null,
        minZoom: layer.options.minZoom,
        listed: false,
      }));
      this.updateChartLayers();
    });
  }

  // Re-derive which cached local charts belong in the layer control for the
  // current view. A chart is listed (and, when the "Use Chart Layers" option is
  // on, enabled by default) only while the map is zoomed in far enough to render
  // its tiles — below a chart's native minzoom Leaflet draws nothing — and its
  // coverage overlaps the visible area. Charts with no bounds/zoom metadata are
  // treated as global and always shown. Panning or zooming a chart out of view
  // removes it from both the map and the control; bringing it back re-adds it.
  updateChartLayers() {
    if (!this.map || !this.layersControl || !this.chartLayers.length)
      return;
    const zoom = this.map.getZoom();
    const view = this.map.getBounds();
    let changed = false;
    for (const chart of this.chartLayers) {
      const show =
        (!Number.isFinite(chart.minZoom) || zoom >= chart.minZoom) &&
        (!chart.bounds || chart.bounds.intersects(view));
      if (show === chart.listed)
        continue;
      if (show) {
        // Add to the map before the control so the control renders the
        // overlay's checkbox already ticked (it reads map.hasLayer at build).
        // With the option off, list it in the control but leave it off the map
        // so its checkbox renders unticked, ready to enable by hand.
        if (this.config.enableChartLayers)
          chart.layer.addTo(this.map);
        this.layersControl.addOverlay(chart.layer, chart.name);
      } else {
        this.map.removeLayer(chart.layer);
        this.layersControl.removeLayer(chart.layer);
      }
      chart.listed = show;
      changed = true;
    }
    // Programmatic add/remove doesn't fire overlayadd/overlayremove, so refresh
    // the attribution strip by hand when a chart's credit came or went.
    if (changed)
      this.updateAttribution();
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

  // === Live updates ===============================================================

  // Recompute derived state from the delta-fed AppState and re-render on a fixed
  // cadence, decoupled from the delta arrival rate so a burst of updates doesn't
  // trigger a redraw per message.
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
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

AnchorAlarm.startup();
