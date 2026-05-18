//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]'))
    processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes)
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true,
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
//#endregion
//#region ui/js/SignalKClient.js
var SIGNALK_DEFAULT_FRESHNESS_SEC = 300;
var SignalKClient = class SignalKClient {
  constructor({ baseUrl = "", pluginName = null } = {}) {
    this.baseUrl = baseUrl;
    this.pluginName = pluginName;
  }
  request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("Request timed out"), 5e3);
    return fetch(`${this.baseUrl}/signalk/v1/api/${path}`, {
      signal: controller.signal,
    })
      .finally(() => clearTimeout(timer))
      .then(SignalKClient._toJsonOrReject);
  }
  raiseAnchor() {
    return this.pluginPost("raiseAnchor");
  }
  dropAnchor(position, radius) {
    return this.pluginPost("dropAnchor", {
      position,
      radius,
    });
  }
  setRadius(radius) {
    return this.pluginPost("setRadius", { radius });
  }
  pluginPost(action, data) {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    }).then((response) => {
      if (response.status === 401) location.href = "/admin/#/login";
      return SignalKClient._toJsonOrReject(response);
    });
  }
  static _toJsonOrReject(response) {
    if (!response.ok)
      return Promise.reject({
        status: response.status,
        statusText: response.statusText,
      });
    return response.json();
  }
  fetchSelf() {
    return this.request("vessels/self");
  }
  fetchAllVessels() {
    return this.request("vessels");
  }
  fetchTracks(radius) {
    return this.request(`tracks?radius=${radius}`);
  }
  static extract(tree, path = "") {
    if (!tree) return null;
    if (!path) return tree;
    let node = tree;
    for (const key of path.split(".")) {
      if (node == null || typeof node !== "object") return null;
      node = node[key];
    }
    return node ?? null;
  }
  static value(tree, path = "", fallback = void 0) {
    const node = this.extract(tree, path);
    return node && node.value !== void 0 ? node.value : fallback;
  }
  static freshValue(
    tree,
    path = "",
    { maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC, fallback = void 0 } = {},
  ) {
    const node = this.extract(tree, path);
    if (!node || node.value === void 0) return fallback;
    if (!this.isFresh(node, maxAge)) {
      const ageSec = node.timestamp
        ? Math.round((Date.now() - new Date(node.timestamp).getTime()) / 1e3)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKClient.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      return fallback;
    }
    return node.value;
  }
  static isFresh(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    if (!delta || !delta.timestamp) return false;
    return (Date.now() - new Date(delta.timestamp).getTime()) / 1e3 <= maxAge;
  }
  static isStale(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    return !this.isFresh(delta, maxAge);
  }
};
//#endregion
//#region ui/js/ShipIcons.js
var RANGES = [
  {
    start: 20,
    end: 29,
    icon: "wing-in-ground.png",
  },
  {
    start: 30,
    end: 30,
    icon: "fishing.png",
  },
  {
    start: 31,
    end: 32,
    icon: "towing.png",
  },
  {
    start: 33,
    end: 33,
    icon: "dredging.png",
  },
  {
    start: 34,
    end: 34,
    icon: "diving.png",
  },
  {
    start: 35,
    end: 35,
    icon: "military.png",
  },
  {
    start: 37,
    end: 37,
    icon: "pleasure.png",
  },
  {
    start: 40,
    end: 49,
    icon: "high-speed-craft.png",
  },
  {
    start: 50,
    end: 50,
    icon: "pilot.png",
  },
  {
    start: 51,
    end: 51,
    icon: "sar.png",
  },
  {
    start: 52,
    end: 52,
    icon: "tug.png",
  },
  {
    start: 53,
    end: 53,
    icon: "port-tender.png",
  },
  {
    start: 54,
    end: 54,
    icon: "anti-pollution.png",
  },
  {
    start: 55,
    end: 55,
    icon: "police.png",
  },
  {
    start: 58,
    end: 58,
    icon: "medical.png",
  },
  {
    start: 59,
    end: 59,
    icon: "noncombatant.png",
  },
  {
    start: 60,
    end: 69,
    icon: "passenger.png",
  },
  {
    start: 70,
    end: 79,
    icon: "cargo.png",
  },
  {
    start: 80,
    end: 89,
    icon: "tanker.png",
  },
  {
    start: 90,
    end: 99,
    icon: "other.png",
  },
];
var ShipIcons = class {
  static iconFor(aisShipType, aspectRatio) {
    aisShipType = parseInt(aisShipType, 10);
    if (aisShipType === 36)
      return aspectRatio >= 2.5
        ? "icons/ships/png/sailboat.png"
        : "icons/ships/png/catamaran.png";
    const range = RANGES.find(
      (r) => aisShipType >= r.start && aisShipType <= r.end,
    );
    return range
      ? `icons/ships/png/${range.icon}`
      : "icons/ships/png/default.png";
  }
};
//#endregion
//#region ui/js/BoatConfig.js
var DEFAULTS = {
  name: "Unknown",
  loa: 14,
  beam: 4,
  anchorRollerHeight: 0,
  gpsBowXDistance: 0,
  gpsBowYDistance: 0,
  aisShipType: 36,
  mmsi: "",
  heading: 0,
};
var BoatConfig = class BoatConfig {
  constructor({
    loa,
    beam,
    anchorRollerHeight,
    gpsBowXDistance,
    gpsBowYDistance,
    aisShipType,
    mmsi,
    heading,
  }) {
    this.loa = loa;
    this.beam = beam;
    this.anchorRollerHeight = anchorRollerHeight;
    this.gpsBowXDistance = gpsBowXDistance;
    this.gpsBowYDistance = gpsBowYDistance;
    this.aisShipType = aisShipType;
    this.mmsi = mmsi;
    this.heading = heading;
  }
  static extract(data) {
    let config = {};
    config.name = data.name ?? DEFAULTS.name;
    config.mmsi = data.mmsi ?? DEFAULTS.mmsi;
    config.loa =
      SignalKClient.value(data, "design.length")?.overall ?? DEFAULTS.loa;
    config.beam = SignalKClient.value(data, "design.beam") ?? DEFAULTS.beam;
    config.anchorRollerHeight =
      SignalKClient.value(data, "design.bowAnchorRollerHeight") ??
      DEFAULTS.rollerHeight;
    if (data.sensors.gps) {
      config.gpsBowXDistance =
        SignalKClient.value(data, "sensors.gps.fromCenter") ??
        DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance =
        SignalKClient.value(data, "sensors.gps.fromBow") ??
        DEFAULTS.gpsBowYDistance;
    } else if (data.sensors.ais) {
      config.gpsBowXDistance =
        SignalKClient.value(data, "sensors.ais.fromCenter") ??
        DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance =
        SignalKClient.value(data, "sensors.ais.fromBow") ?? config.loa / 2;
    }
    config.aisShipType =
      SignalKClient.value(data, "design.aisShipType")?.id ??
      DEFAULTS.aisShipType;
    return new BoatConfig(config);
  }
  get bowOffset() {
    return {
      x: this.beam / 2 + this.gpsBowXDistance,
      y: this.gpsBowYDistance,
    };
  }
  get gpsOffset() {
    return {
      x: this.gpsBowXDistance,
      y: this.gpsBowYDistance,
    };
  }
  get loaToBeam() {
    return this.loa / this.beam;
  }
  get icon() {
    return ShipIcons.iconFor(this.aisShipType, this.loaToBeam);
  }
};
//#endregion
//#region ui/js/GeoMath.js
var MPS_TO_KNOTS = 1.94384;
var GeoMath = class GeoMath {
  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  static rad2deg(radians) {
    return (radians * 180) / Math.PI;
  }
  static normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }
  /**
   * Returns the length of the vector (x, y) from the origin.
   * @param {number} x – x-coordinate
   * @param {number} y – y-coordinate
   * @returns {number} distance from (0,0) to (x,y)
   */
  static calculateVectorDistance(x, y) {
    return Math.sqrt(x * x + y * y);
  }
  static calculateDistance(lat1, lon1, lat2, lon2) {
    let R = 6371e3;
    let dLat = GeoMath.deg2rad(lat2 - lat1);
    let dLon = GeoMath.deg2rad(lon2 - lon1);
    let a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(GeoMath.deg2rad(lat1)) *
        Math.cos(GeoMath.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  static calculateBearing(lat1, lon1, lat2, lon2) {
    var θa = GeoMath.deg2rad(lat1);
    var θb = GeoMath.deg2rad(lat2);
    var ΔL = GeoMath.deg2rad(lon2 - lon1);
    var X = Math.cos(θb) * Math.sin(ΔL);
    var Y =
      Math.cos(θa) * Math.sin(θb) - Math.sin(θa) * Math.cos(θb) * Math.cos(ΔL);
    var β = Math.atan2(X, Y);
    var bearing = GeoMath.rad2deg(β);
    bearing = (bearing + 360) % 360;
    return bearing;
  }
  /**
   * Calculates the destination point given starting latitude and longitude,
   * bearing, and distance using the haversine formula.
   *
   * @param {number} lat1 - Starting latitude in degrees.
   * @param {number} lon1 - Starting longitude in degrees.
   * @param {number} bearing - Bearing in degrees (clockwise from north).
   * @param {number} distance - Distance to travel from the starting point in meters.
   * @returns {{ latitude: number, longitude: number }} - The destination latitude and longitude.
   */
  static calculateDestinationPoint(lat1, lon1, bearing, distance) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const λ1 = (lon1 * Math.PI) / 180;
    const θ = (bearing * Math.PI) / 180;
    const δ = distance / R;
    const sinφ1 = Math.sin(φ1);
    const cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ);
    const cosδ = Math.cos(δ);
    const sinθ = Math.sin(θ);
    const cosθ = Math.cos(θ);
    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
    const φ2 = Math.asin(sinφ2);
    const y = sinθ * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);
    return {
      latitude: (φ2 * 180) / Math.PI,
      longitude: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
    };
  }
  static calculateBowCoordinates(current, heading, xOffset, yOffset) {
    let bc = GeoMath.calculateDestinationPoint(
      current.lat,
      current.lng,
      heading,
      yOffset,
    );
    if (xOffset != 0)
      bc = GeoMath.calculateDestinationPoint(
        bc.latitude,
        bc.longitude,
        heading - 90,
        xOffset,
      );
    return L.latLng(bc.latitude, bc.longitude);
  }
  /**
   * Estimate current tide height with sinusoidal easing
   *
   * @param {Date|string|number} lowTime      — time of low tide
   * @param {number}            lowHeight    — height at low tide
   * @param {Date|string|number} highTime     — time of high tide
   * @param {number}            highHeight   — height at high tide
   * @param {Date|string|number} [currentTime=new Date()] — time to estimate
   * @returns {number} smoothly interpolated tide height
   */
  static estimateTideHeightSmooth(
    lowTime,
    lowHeight,
    highTime,
    highHeight,
    currentTime = /* @__PURE__ */ new Date(),
  ) {
    const tLow = (
      lowTime instanceof Date ? lowTime : new Date(lowTime)
    ).getTime();
    const tHigh = (
      highTime instanceof Date ? highTime : new Date(highTime)
    ).getTime();
    const tCurrent = (
      currentTime instanceof Date ? currentTime : new Date(currentTime)
    ).getTime();
    let t0, h0, t1, h1;
    if (tLow < tHigh)
      if (tCurrent <= tLow) {
        t0 = tLow - (tHigh - tLow);
        h0 = highHeight;
        t1 = tLow;
        h1 = lowHeight;
      } else if (tCurrent >= tHigh) {
        t0 = tHigh;
        h0 = highHeight;
        t1 = tHigh + (tHigh - tLow);
        h1 = lowHeight;
      } else {
        t0 = tLow;
        h0 = lowHeight;
        t1 = tHigh;
        h1 = highHeight;
      }
    else if (tCurrent <= tHigh) {
      t0 = tHigh - (tLow - tHigh);
      h0 = lowHeight;
      t1 = tHigh;
      h1 = highHeight;
    } else if (tCurrent >= tLow) {
      t0 = tLow;
      h0 = lowHeight;
      t1 = tLow + (tLow - tHigh);
      h1 = highHeight;
    } else {
      t0 = tHigh;
      h0 = highHeight;
      t1 = tLow;
      h1 = lowHeight;
    }
    const frac = (tCurrent - t0) / (t1 - t0);
    const sineFrac = (1 - Math.cos(Math.PI * frac)) / 2;
    return h0 + (h1 - h0) * sineFrac;
  }
};
//#endregion
//#region ui/js/AppState.js
var DEFAULT_FRESHNESS_SEC = 300;
var AppState = class {
  constructor() {}
  getPosition() {
    if (this.currentCoordinates)
      return L.latLng(
        this.currentCoordinates.value.latitude,
        this.currentCoordinates.value.longitude,
      );
    else return L.latLng(0, 0);
  }
  getAnchorPosition() {
    if (this.anchor.position && this.anchor.position.value)
      return L.latLng(
        this.anchor.position.value.latitude,
        this.anchor.position.value.longitude,
      );
    else return L.latLng(0, 0);
  }
  extract(tree, path, fresh = true, maxAge = DEFAULT_FRESHNESS_SEC) {
    let data = SignalKClient.extract(tree, path);
    if (!data) return null;
    if (fresh && !SignalKClient.isFresh(data, maxAge)) {
      const ageSec = data.timestamp
        ? Math.round((Date.now() - new Date(data.timestamp).getTime()) / 1e3)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKClient.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      return null;
    }
    return data;
  }
  extractAll(data) {
    this.boatConfig = BoatConfig.extract(data);
    this.currentCoordinates = this.extract(data, "navigation.position");
    this.heading = this.extract(data, "navigation.headingTrue") ?? this.heading;
    this.belowKeel =
      this.extract(data, "environment.depth.belowKeel") ?? this.belowKeel;
    this.belowSurface =
      this.extract(data, "environment.depth.belowSurface") ?? this.belowSurface;
    this.twa = this.extract(data, "environment.wind.directionTrue") ?? this.twa;
    this.aws = this.extract(data, "environment.wind.speedApparent") ?? this.aws;
    this.tide = this.extract(data, "environment.tide", false) ?? this.tide;
    if (!this.anchor) this.anchor = {};
    this.anchor.position =
      this.extract(data, "navigation.anchor.position", false) ??
      this.anchor.position;
    this.anchor.state =
      this.extract(data, "navigation.anchor.state", false) ?? this.anchor.state;
    this.anchor.maxRadius =
      this.extract(data, "navigation.anchor.maxRadius", false) ??
      this.anchor.maxRadius;
    this.anchor.notification =
      this.extract(data, "notifications.navigation.anchor", false) ??
      this.anchor.notification;
  }
  calculate() {
    this.calculateTides();
    this.boatConfig.heading = this.computeOwnHeading();
    this.calculateScopes();
  }
  calculateTides() {
    if (!this.tide) return;
    this.currentTide = GeoMath.estimateTideHeightSmooth(
      this.tide.timeLow.value,
      this.tide.heightLow.value,
      this.tide.timeHigh.value,
      this.tide.heightHigh.value,
    );
    this.tidalRise = this.tide.heightHigh.value - this.currentTide;
    this.tidalFall = this.currentTide - this.tide.heightLow.value;
  }
  calculateScopes() {
    this.scope7 = this.calculateScope(7);
    this.scope5 = this.calculateScope(5);
    this.scope4 = this.calculateScope(4);
    this.scope3 = this.calculateScope(3);
  }
  calculateScope(scope) {
    let maxHeight = this.belowSurface.value;
    maxHeight += this.boatConfig.anchorRollerHeight;
    maxHeight += this.tidalRise;
    return maxHeight * scope;
  }
  computeOwnHeading() {
    if (this.heading) return GeoMath.rad2deg(this.heading.value);
    if (this.anchorPosition && this.currentCoordinates)
      return Math.round(
        GeoMath.calculateBearing(
          this.currentCoordinates.value.latitude,
          this.currentCoordinates.value.longitude,
          this.anchorPosition.value.latitude,
          this.anchorPosition.value.longitude,
        ),
      );
    if (this.twa) return GeoMath.rad2deg(this.twa.value);
    return 0;
  }
};
//#endregion
//#region ui/js/FleetLayer.js
var MAX_OWN_TRACK_POINTS = 3600 * 24;
var POLL_INTERVAL_MS$1 = 5e3;
var DEFAULT_FILTER_RADIUS = 500;
var GPS_ANTENNA_ICON = L.icon({
  iconUrl: "icons/antenna.svg",
  iconSize: [25, 25],
  iconAnchor: [13, 25],
});
var FleetLayer = class {
  constructor({ app, map, ownMmsi }) {
    this.app = app;
    this.map = map;
    this.ownMmsi = ownMmsi;
    this.vessels = {};
    this.vesselTracks = {};
    this.ownVessel = void 0;
    this.ownAntenna = void 0;
    this.ownBoatConfig = void 0;
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
    this.fleetTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS$1);
    this.poll();
  }
  poll() {
    if (this._pollInFlight) return;
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
        const msg = `Fleet update failed: ${error.status ? `${error.status} ` : ""}${detail}`;
        this.statusBar.setWarning(msg);
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
  setOwnVessel(coords, boatConfig) {
    this.ownBoatConfig = boatConfig;
    this.ownVessel = new L.BoatMarker(coords, {
      beam: boatConfig.beam,
      loa: boatConfig.loa,
      gpsOffset: boatConfig.bowOffset,
      heading: boatConfig.heading,
      icon: boatConfig.icon,
    }).addTo(this.map);
    this.ownAntenna = L.marker(coords, { icon: GPS_ANTENNA_ICON }).addTo(
      this.map,
    );
  }
  updateOwnPosition(coords, heading) {
    this.ownVessel.setLatLng(coords);
    this.ownVessel.setHeading(heading);
    this.ownAntenna.setLatLng(coords);
  }
  loadHistoricalTracks(tracks, ownLatLng, filterRadius) {
    const mmsiRegex = /urn:mrn:imo:mmsi:(\d+)$/;
    for (let uri in tracks) {
      const match = uri.match(mmsiRegex);
      if (!match) continue;
      const mmsi = match[1];
      const history = tracks[uri].coordinates?.[0];
      if (!history || !history.length) continue;
      const points = [];
      let i = 0;
      for (let position of history) {
        const lat = position[1];
        const lon = position[0];
        if (
          GeoMath.calculateDistance(ownLatLng.lat, ownLatLng.lng, lat, lon) <
          filterRadius
        ) {
          points.push([lat, lon, i]);
          i++;
        }
      }
      if (!points.length) continue;
      this.vesselTracks[mmsi] = this.createTrack(points, points.length);
    }
  }
  appendOwnTrack(latLng) {
    const ownTrack = this.vesselTracks[this.ownMmsi];
    if (!ownTrack) return;
    ownTrack.addLatLng([latLng.lat, latLng.lng, ownTrack.getLatLngs().length]);
    ownTrack.options.max++;
    const pts = ownTrack.getLatLngs();
    if (pts.length > MAX_OWN_TRACK_POINTS) {
      const trimmed = pts.slice(-MAX_OWN_TRACK_POINTS);
      ownTrack.setLatLngs(trimmed);
      ownTrack.options.min = trimmed[0].alt;
    }
  }
  syncOtherVessels(vessels, { ownLatLng, filterRadius, twa }) {
    const detected = [];
    for (let key in vessels) {
      const vessel = vessels[key];
      if (vessel.mmsi == this.ownMmsi) continue;
      if (!("navigation" in vessel) || !("position" in vessel.navigation))
        continue;
      const position = vessel.navigation.position.value;
      const distance = GeoMath.calculateDistance(
        position.latitude,
        position.longitude,
        ownLatLng.lat,
        ownLatLng.lng,
      );
      if (distance > filterRadius) continue;
      detected.push(vessel.mmsi);
      const heading = this.deriveVesselHeading(vessel, twa);
      const distanceRounded = Math.round(distance);
      if (vessel.mmsi in this.vessels)
        this.updateExistingVessel(vessel, position, heading, distanceRounded);
      else this.addNewVessel(vessel, position, heading, distanceRounded);
    }
    const detectedSet = new Set(detected.map(String));
    for (let mmsi in this.vessels)
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
  deriveVesselHeading(vessel, twa) {
    let sog = 0;
    const sogVal = SignalKClient.value(vessel, "navigation.speedOverGround");
    if (sogVal !== void 0) sog = sogVal * MPS_TO_KNOTS;
    const headingTrue = SignalKClient.value(vessel, "navigation.headingTrue");
    if (headingTrue !== void 0) return GeoMath.rad2deg(headingTrue);
    const cog = SignalKClient.value(vessel, "navigation.courseOverGroundTrue");
    if (cog !== void 0 && sog > 1) return GeoMath.rad2deg(cog);
    if (twa) return GeoMath.rad2deg(twa.value);
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
      heading,
      icon: config.icon,
    });
    marker.addTo(this.map).bindPopup(`${vessel.name} at ${distance} meters`);
    marker.gpsAntennaMarker = L.marker(
      [position.latitude, position.longitude],
      { icon: GPS_ANTENNA_ICON },
    ).addTo(this.map);
    this.vessels[vessel.mmsi] = marker;
    if (!(vessel.mmsi in this.vesselTracks))
      this.vesselTracks[vessel.mmsi] = this.createTrack(
        [[position.latitude, position.longitude, 0]],
        1,
      );
  }
  createTrack(points, max) {
    return L.hotline(points, {
      color: "red",
      weight: 1,
      min: 0,
      max,
      palette: {
        0: "red",
        0.5: "yellow",
        1: "green",
      },
      outlineWidth: 0,
      text: "",
    }).addTo(this.map);
  }
};
//#endregion
//#region ui/js/WindBarb.js
var WindBarb = Object.freeze({
  knot0:
    '<path fill="#1A232D" d="M125,120c2.762,0,5,2.239,5,5c0,2.762-2.238,5-5,5c-2.761,0-5-2.238-5-5C120,122.239,122.239,120,125,120z"/><path fill="none" stroke="#1A232D" stroke-width="2" d="M125,115c5.523,0,10,4.477,10,10c0,5.523-4.477,10-10,10 c-5.523,0-10-4.477-10-10C115,119.477,119.477,115,125,115z "/>',
  knot2: '<path class="svg-wb" d="M125,112V76 M125,125l7-12.1h-14L125,125z"/>',
  knot5:
    '<path class="svg-wb" d="M125,112V76 M125,89l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot10:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot15:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot20:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot25:
    '<path class="svg-wb" d="M125,112V79 M125,79l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot30:
    '<path class="svg-wb" d="M125,112V79 M125,79l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot35:
    '<path class="svg-wb" d="M125,112V69 M125,69l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot40:
    '<path class="svg-wb" d="M125,112V69 M125,69l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot45:
    '<path class="svg-wb" d="M125,112V59 M125,59l14-14 M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14 L125,125z"/>',
  knot50:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot55:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot60:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot65:
    '<path class="svg-wb" d="M125,112V66 M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot70:
    '<path class="svg-wb" d="M125,112V66 M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot75:
    '<path class="svg-wb" d="M125,112V56 M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot80:
    '<path class="svg-wb" d="M125,112V56 M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot85:
    '<path class="svg-wb" d="M125,112V46 M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1 h-14L125,125z"/>',
  knot90:
    '<path class="svg-wb" d="M125,112V46 M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1 h-14L125,125z"/>',
  knot95:
    '<path class="svg-wb" d="M125,112V36 M125,36h14l-14,14V36z M125,60l14-14 M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot100:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot105:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot110:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot115:
    '<path class="svg-wb" d="M125,112V52 M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14 L125,125z"/>',
  knot120:
    '<path class="svg-wb" d="M125,112V52 M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14 L125,125z"/>',
  knot125:
    '<path class="svg-wb" d="M125,112V42 M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125 l7-12.1h-14L125,125z"/>',
  knot130:
    '<path class="svg-wb" d="M125,112V42 M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125 l7-12.1h-14L125,125z"/>',
  knot135:
    '<path class="svg-wb" d="M125,112V32 M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100 l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot140:
    '<path class="svg-wb" d="M125,112V32 M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100 l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot145:
    '<path class="svg-wb" d="M125,112V22 M125,22h14l-14,14V22z M125,36h14l-14,14V36z M125,60l14-14 M125,70l14-14 M125,80l14-14 M125,90 l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot150:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot155:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1 h-14L125,125z"/>',
  knot160:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l14-14 M125,125 l7-12.1h-14L125,125z"/>',
  knot165:
    '<path class="svg-wb" d="M125,112V38 M125,38h14l-14,14V38z M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot170:
    '<path class="svg-wb" d="M125,112V38 M125,38h14l-14,14V38z M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot175:
    '<path class="svg-wb" d="M125,112V28 M125,28h14l-14,14V28z M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot180:
    '<path class="svg-wb" d="M125,112V28 M125,28h14l-14,14V28z M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot185:
    '<path class="svg-wb" d="M125,112V18 M125,18h14l-14,14V18z M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot190:
    '<path class="svg-wb" d="M125,112V18 M125,18h14l-14,14V18z M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
});
var computeMinY = function (svgInner) {
  let minY = Infinity;
  const dAttrRe = /\bd="([^"]+)"/g;
  let dMatch;
  while ((dMatch = dAttrRe.exec(svgInner)) !== null) {
    const tokens = dMatch[1].match(/-?\d+(?:\.\d+)?|[a-zA-Z]/g) || [];
    let cx = 0,
      cy = 0,
      cmd = null;
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/[a-zA-Z]/.test(t)) {
        cmd = t;
        i++;
        continue;
      }
      switch (cmd) {
        case "M":
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          cmd = "L";
          break;
        case "m":
          cx += +tokens[i++];
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          cmd = "l";
          break;
        case "L":
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "l":
          cx += +tokens[i++];
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "V":
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "v":
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "H":
          cx = +tokens[i++];
          break;
        case "h":
          cx += +tokens[i++];
          break;
        case "C": {
          +tokens[i++];
          const y1 = +tokens[i++];
          +tokens[i++];
          const y2 = +tokens[i++];
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, y1, y2, cy);
          break;
        }
        case "c": {
          +tokens[i++];
          const dy1 = +tokens[i++];
          +tokens[i++];
          const dy2 = +tokens[i++];
          const dx = +tokens[i++],
            dy = +tokens[i++];
          minY = Math.min(minY, cy + dy1, cy + dy2, cy + dy);
          cx += dx;
          cy += dy;
          break;
        }
        case "Z":
        case "z":
          break;
        default:
          i++;
          break;
      }
    }
  }
  return minY;
};
var VIEWBOX_X = 113;
var VIEWBOX_WIDTH = 28;
var VIEWBOX_BOTTOM = 137;
var VIEWBOX_TOP_PADDING = 2;
var WindBarbViewBox = Object.freeze(
  Object.fromEntries(
    Object.entries(WindBarb).map(([key, path]) => {
      const minY = computeMinY(path);
      const top = Math.floor(minY - VIEWBOX_TOP_PADDING);
      return [
        key,
        `${VIEWBOX_X} ${top} ${VIEWBOX_WIDTH} ${VIEWBOX_BOTTOM - top}`,
      ];
    }),
  ),
);
var roundToNearest = function (value, nearest) {
  return Math.round(value / nearest) * nearest;
};
var roundDownToNearest = function (value, nearest) {
  return Math.floor(value / nearest) * nearest;
};
var metersPerSecondToKnots = function (mps) {
  return mps * 1.943844;
};
var hasNestedProperty = (obj, prop, ...rest) => {
  if (obj === void 0) return false;
  if (rest.length === 0 && Object.prototype.hasOwnProperty.call(obj, prop))
    return true;
  return hasNestedProperty(obj[prop], ...rest);
};
var getSvgKey = function (windSpeed) {
  if (windSpeed >= 1 && windSpeed < 2.5) return "knot2";
  const windBarbName = `knot${roundToNearest(metersPerSecondToKnots(roundDownToNearest(windSpeed, 2.5)), 5)}`;
  if (hasNestedProperty(WindBarb, windBarbName)) return windBarbName;
  return "knot0";
};
var getWindBarb = function (windSpeed) {
  const key = getSvgKey(windSpeed);
  return `
        <svg xmlns="http://www.w3.org/2000/svg" class="wind-barb" viewBox="${WindBarbViewBox[key]}">
            ${WindBarb[key]}
        </svg>
    `;
};
//#endregion
//#region ui/js/HudPanels.js
var StatusBar = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "statusBar leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "statusBarUI";
    container.style.display = "none";
    this._container = container;
    return container;
  },
  setStatus: function (text) {
    this._render(text, "black");
  },
  setWarning: function (text) {
    this._render(text, "#d97706");
  },
  setError: function (text) {
    this._render(text, "red");
  },
  _render: function (text, color) {
    if (!this._container) return;
    this._container.textContent = text;
    this._container.style.color = color;
    this._container.style.display = "";
  },
  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
var HomeButtonControl = L.Control.extend({
  options: {
    position: "topright",
    onHome: null,
  },
  onAdd: function (map) {
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const homeButton = L.DomUtil.create("a", "leaflet-control-home", container);
    homeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="0.75" class="bi bi-house" viewBox="0 0 16 16">
  <path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z"/>
</svg>`;
    homeButton.href = "#";
    homeButton.title = "Center on Boat";
    homeButton.setAttribute("role", "button");
    L.DomEvent.disableClickPropagation(container);
    const onHome = this.options.onHome;
    L.DomEvent.on(homeButton, "click", function (e) {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      if (onHome) onHome(map);
    });
    return container;
  },
});
var InfoPanel = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "info leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "infoUI";
    container.innerHTML = `
        <table>
          <tr>
            <th>Depth:</th>
            <td><span title="Below Surface" id='belowSurface'>~</span></td>
          </tr>
          <tr>
            <th>Status:</th>
            <td><span id='pluginStatus'>Loading</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._belowSurface = container.querySelector("#belowSurface");
    this._pluginStatus = container.querySelector("#pluginStatus");
    return container;
  },
  update: function (state) {
    this.setBelowSurface(state.belowSurface);
    this.setStatus(state.anchor.notification);
  },
  setBelowSurface: function (dbs) {
    if (dbs)
      this._belowSurface.textContent = `${parseFloat(dbs.value).toFixed(1)}m`;
    else this._belowSurface.textContent = "~";
  },
  setStatus: function (notification) {
    if (notification) {
      this._pluginStatus.textContent = notification.value.message;
      this._pluginStatus.className = "";
      if (notification.value.message !== "Off" && notification.value.state)
        this._pluginStatus.classList.add(notification.value.state);
    } else this._pluginStatus.textContent = "Unknown";
  },
  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
var WindPanel = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "windBarbControl leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "windBarbUI";
    container.innerHTML = `
      <div><b>Wind</b></div>
      <div id="windBarbContainer"></div>
      <div id="awsValue">~</div>
    `;
    this._container = container;
    this._aws = container.querySelector("#awsValue");
    this._barb = container.querySelector("#windBarbContainer");
    return container;
  },
  setSpeed: function (aws, twa) {
    if (!aws) {
      this._aws.innerHTML = "~";
      return;
    }
    const kts = Math.round(aws.value * MPS_TO_KNOTS);
    this._aws.innerHTML = `${kts}kts`;
    const windBarbIcon = getWindBarb(aws.value);
    this._barb.innerHTML = windBarbIcon;
    const svg = this._barb.querySelector("svg");
    if (svg) {
      let angle = 0;
      if (twa) angle = GeoMath.rad2deg(Math.round(twa.value));
      svg.style.transform = `rotate(${Math.round(angle)}deg)`;
    }
  },
  setAngle: function (twa) {
    if (!twa) return;
    const angle = GeoMath.rad2deg(Math.round(twa.value));
    const svg = this._barb.querySelector("svg");
    if (svg) svg.style.transform = `rotate(${angle}deg)`;
  },
  update: function (state) {
    this.setSpeed(state.aws, state.twa);
  },
  clearSpeed: function () {
    this._aws.innerHTML = "~";
  },
});
var ScopePanel = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "scope leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "scopeUI";
    container.innerHTML = `
        <table>
          <tr>
            <th>Water&nbsp;Depth</th>
            <td><span id='scopeDepth'>~</span></td>
          </tr>
          <tr>
            <th>Bow&nbsp;Height</th>
            <td>+ <span id='bowHeight'>~</span></td>
          </tr>
          <tr>
            <th>Tidal&nbsp;Rise</th>
            <td>+ <span id='tidalRise'>~</span></td>
          </tr>
          <tr>
            <th>Total</th>
            <td>= <span id='scopeTotal'>~</span></td>
          </tr>
          <tr>
            <th colspan="2">&nbsp;</th>
          </tr>
          <tr>
            <th>7:1&nbsp;Scope</th>
            <td><span id='scope7to1'>~</span></td>
          </tr>
          <tr>
            <th>5:1&nbsp;Scope</th>
            <td><span id='scope5to1'>~</span></td>
          </tr>
          <tr>
            <th>4:1&nbsp;Scope</th>
            <td><span id='scope4to1'>~</span></td>
          </tr>
          <tr>
            <th>3:1&nbsp;Scope</th>
            <td><span id='scope3to1'>~</span></td>
          </tr>
          <tr>
            <th colspan="2">&nbsp;</th>
          </tr>
          <tr>
            <th>Below&nbsp;Keel</th>
            <td><span id='belowKeel'>~</span></td>
          </tr>
          <tr>
            <th>Tidal&nbsp;Fall</th>
            <td>- <span id='tidalFall'>~</span></td>
          </tr>
          <tr class="minimumDepthRow">
            <th>Minimum&nbsp;Depth</th>
            <td>= <span id='minimumDepth'>~</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._refs = {
      scopeDepth: container.querySelector("#scopeDepth"),
      bowHeight: container.querySelector("#bowHeight"),
      tidalRise: container.querySelector("#tidalRise"),
      scopeTotal: container.querySelector("#scopeTotal"),
      scope7to1: container.querySelector("#scope7to1"),
      scope5to1: container.querySelector("#scope5to1"),
      scope4to1: container.querySelector("#scope4to1"),
      scope3to1: container.querySelector("#scope3to1"),
      belowKeel: container.querySelector("#belowKeel"),
      tidalFall: container.querySelector("#tidalFall"),
      minimumDepth: container.querySelector("#minimumDepth"),
      minimumDepthRow: container.querySelector(".minimumDepthRow"),
    };
    return container;
  },
  update: function (state) {
    if (state.belowSurface && state.belowKeel) {
      const maxHeight =
        state.belowSurface.value +
        state.boatConfig.anchorRollerHeight +
        state.tidalRise;
      this._refs.scopeTotal.innerHTML = `${maxHeight.toFixed(1)}m`;
      this._refs.scopeDepth.innerHTML = `${state.belowSurface.value.toFixed(1)}m`;
      this._refs.belowKeel.innerHTML = `${state.belowKeel.value.toFixed(1)}m`;
    } else {
      this._refs.scopeTotal.innerHTML = "~";
      this._refs.scopeDepth.innerHTML = "~";
      this._refs.belowKeel.innerHTML = "~";
    }
    if (state.tide && state.belowKeel) {
      const minimumDepth = state.belowKeel.value - state.tidalFall;
      this._refs.minimumDepth.innerHTML = `${minimumDepth.toFixed(1)}m`;
      if (minimumDepth > 1) this._refs.minimumDepthRow.style.color = "green";
      else if (minimumDepth > 0)
        this._refs.minimumDepthRow.style.color = "orange";
      else this._refs.minimumDepthRow.style.color = "red";
    } else this._refs.minimumDepth.innerHTML = "~";
    if (state.tide) {
      this._refs.tidalRise.innerHTML = `${state.tidalRise.toFixed(1)}m`;
      this._refs.tidalFall.innerHTML = `${state.tidalFall.toFixed(1)}m`;
    } else {
      this._refs.tidalRise.innerHTML = "~";
      this._refs.tidalFall.innerHTML = "~";
    }
    this._refs.scope7to1.innerHTML = `${state.scope7.toFixed(1)}m`;
    this._refs.scope5to1.innerHTML = `${state.scope5.toFixed(1)}m`;
    this._refs.scope4to1.innerHTML = `${state.scope4.toFixed(1)}m`;
    this._refs.scope3to1.innerHTML = `${state.scope3.toFixed(1)}m`;
    this._refs.bowHeight.innerHTML = `${state.boatConfig.anchorRollerHeight.toFixed(1)}m`;
  },
  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
//#endregion
//#region ui/js/StaleReloader.js
var StaleReloader = class {
  constructor({ staleThresholdMs }) {
    this.staleThresholdMs = staleThresholdMs;
    this.hiddenAt = null;
  }
  start() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.hiddenAt = Date.now();
      else if (this.hiddenAt !== null) {
        const elapsed = Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        if (elapsed >= this.staleThresholdMs) window.location.reload();
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.location.reload();
    });
  }
};
//#endregion
//#region ui/js/AnchorOverlay.js
var ANCHOR_ICON = L.icon({
  iconUrl: "icons/anchor.png",
  iconSize: [24, 24],
  iconAnchor: [12, 4],
});
var CROSSHAIR_ICON = L.icon({
  iconUrl: "icons/crosshair.png",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
var AnchorOverlay = class {
  constructor({ map, radius }) {
    this.map = map;
    this.radius = radius;
    this.dropped = false;
    this.anchorPosition = map.getCenter();
    this.boatPosition = null;
    this.heading = 0;
    this.gpsOffsets = {
      x: 0,
      y: 0,
    };
    this.dragHandler = null;
    this.radiusCircle = L.circle(this.anchorPosition, this.radius, {
      color: "green",
    }).addTo(map);
    this.anchorLine = L.polyline([this.anchorPosition, this.anchorPosition], {
      color: "grey",
      weight: 2,
    }).addTo(map);
    this.anchorLineAngle = L.polyline(
      [this.anchorPosition, this.anchorPosition],
      {
        color: "grey",
        weight: 0,
      },
    ).addTo(map);
    this.anchorMarker = null;
    this.crosshairMarker = null;
  }
  drop(position, radius) {
    this.dropped = true;
    this.anchorPosition = position;
    this.radius = parseInt(radius, 10);
    if (!(this.radius > 0)) this.radius = 20;
    this._removeCrosshair();
    this._removeAnchorMarker();
    this.radiusCircle.setLatLng(position);
    this.radiusCircle.setRadius(this.radius);
    this.anchorMarker = L.marker(position, { icon: ANCHOR_ICON }).addTo(
      this.map,
    );
    this._refreshLine();
    this._refreshColor();
    return this;
  }
  raise(position) {
    this.dropped = false;
    this.anchorPosition = position;
    this._removeAnchorMarker();
    this._removeCrosshair();
    this.crosshairMarker = L.marker(position, {
      icon: CROSSHAIR_ICON,
      draggable: true,
    }).addTo(this.map);
    this.crosshairMarker.on("drag", () => {
      this.anchorPosition = this.crosshairMarker.getLatLng();
      this.radiusCircle.setLatLng(this.anchorPosition);
      this._refreshLine();
      this._refreshColor();
      if (this.dragHandler) this.dragHandler(this.anchorPosition);
    });
    this.radiusCircle.setLatLng(position);
    this._refreshLine();
    this._refreshColor();
    return this;
  }
  setRadius(r) {
    this.radius = r;
    this.radiusCircle.setRadius(r);
    this._refreshColor();
    return this;
  }
  setBoatPosition(coords, heading, gpsOffsets) {
    this.boatPosition = coords;
    this.heading = heading;
    this.gpsOffsets = gpsOffsets;
    this._refreshLine();
    this._refreshColor();
    return this;
  }
  onCrosshairDrag(cb) {
    this.dragHandler = cb;
    return this;
  }
  getCrosshairPosition() {
    return this.crosshairMarker ? this.crosshairMarker.getLatLng() : null;
  }
  getBounds() {
    return this.radiusCircle.getBounds();
  }
  update(state) {
    this.setBoatPosition(
      state.getPosition(),
      state.boatConfig.heading,
      state.boatConfig.gpsOffset,
    );
  }
  _refreshLine() {
    if (!this.boatPosition) return;
    const bow = GeoMath.calculateBowCoordinates(
      this.boatPosition,
      this.heading,
      this.gpsOffsets.x,
      this.gpsOffsets.y,
    );
    this.anchorLine.setLatLngs([bow, this.anchorPosition]);
    this.anchorLineAngle.setLatLngs([bow, this.anchorPosition]);
    const flip = bow.lng > this.anchorPosition.lng;
    let distance = GeoMath.calculateDistance(
      bow.lat,
      bow.lng,
      this.anchorPosition.lat,
      this.anchorPosition.lng,
    );
    distance = Math.round(distance * 10) / 10;
    this.anchorLine.setText("");
    this.anchorLine.setText(`${distance}m`, {
      orientation: flip ? "flip" : 0,
      offset: 12,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });
    const bearing = Math.round(
      GeoMath.calculateBearing(
        bow.lat,
        bow.lng,
        this.anchorPosition.lat,
        this.anchorPosition.lng,
      ),
    );
    this.anchorLineAngle.setText("");
    this.anchorLineAngle.setText(`${bearing}°`, {
      orientation: flip ? "flip" : 0,
      offset: -3,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });
  }
  _refreshColor() {
    const baseColor = this.dropped ? "green" : "blue";
    if (!this.boatPosition) {
      this.radiusCircle.setStyle({ color: baseColor });
      return;
    }
    const distance = GeoMath.calculateDistance(
      this.anchorPosition.lat,
      this.anchorPosition.lng,
      this.boatPosition.lat,
      this.boatPosition.lng,
    );
    this.radiusCircle.setStyle({
      color: distance > this.radius ? "red" : baseColor,
    });
  }
  _removeAnchorMarker() {
    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }
  }
  _removeCrosshair() {
    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = null;
    }
  }
};
//#endregion
//#region ui/js/AnchorController.js
var AnchorState = Object.freeze({
  UP: "UP",
  DROPPING: "DROPPING",
  ANCHORED: "ANCHORED",
  RAISING: "RAISING",
});
var AnchorController = class {
  constructor({ overlay, toolbar, signalK, infoPanel, scopePanel, onError }) {
    this._overlay = overlay;
    this._toolbar = toolbar;
    this._signalK = signalK;
    this._infoPanel = infoPanel;
    this._scopePanel = scopePanel;
    this._onError = onError;
    this.state = AnchorState.UP;
    this.anchorCoordinates = null;
    this.maxRadius = 0;
  }
  _reportError(prefix, err) {
    const detail = err?.statusText || err?.message || "unknown error";
    this._onError?.(`${prefix}: ${detail}`);
  }
  requestDrop() {
    if (this.state !== AnchorState.UP) return;
    const pos = this._overlay.getCrosshairPosition();
    if (!pos) return;
    this.state = AnchorState.DROPPING;
    this._enterDropped(pos, this.maxRadius);
    this._signalK
      .dropAnchor(
        {
          latitude: pos.lat,
          longitude: pos.lng,
        },
        this.maxRadius,
      )
      .then(() => {
        this.state = AnchorState.ANCHORED;
        this._toolbar.setState(this.state);
      })
      .catch((err) => {
        this.state = AnchorState.UP;
        this._enterRaised();
        this._reportError("Failed to drop anchor", err);
      });
  }
  requestRaise() {
    if (this.state !== AnchorState.ANCHORED) return;
    const previousAnchor = this.anchorCoordinates;
    const previousRadius = this.maxRadius;
    this.state = AnchorState.RAISING;
    this._enterRaised();
    this._signalK
      .raiseAnchor()
      .then(() => {
        this.state = AnchorState.UP;
        this._toolbar.setState(this.state);
      })
      .catch((err) => {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(previousAnchor, previousRadius);
        this._reportError("Failed to raise anchor", err);
      });
  }
  setRadius(newRadius) {
    this.maxRadius = newRadius;
    this._toolbar.setRadius(newRadius);
    this._overlay.setRadius(newRadius);
    if (this.state === AnchorState.ANCHORED)
      this._signalK
        .setRadius(newRadius)
        .catch((err) => this._reportError("Failed to set radius", err));
  }
  estimateAnchorPosition(appState) {
    if (!appState.currentCoordinates) return;
    if (this.state !== AnchorState.UP) return;
    const distance = appState.calculateScope(5);
    this.setRadius(
      this.computeDefaultRadius(
        distance,
        appState.boatConfig.gpsBowXDistance,
        appState.boatConfig.gpsBowYDistance,
      ),
    );
    const bow = GeoMath.calculateBowCoordinates(
      appState.getPosition(),
      appState.boatConfig.heading,
      appState.boatConfig.gpsBowXDistance,
      appState.boatConfig.gpsBowYDistance,
    );
    const guess = GeoMath.calculateDestinationPoint(
      bow.lat,
      bow.lng,
      appState.boatConfig.heading,
      distance,
    );
    this.restoreRaised(L.latLng(guess.latitude, guess.longitude));
  }
  computeDefaultRadius(anchorDistanceGuess, xOffset, yOffset) {
    let r = anchorDistanceGuess;
    r += GeoMath.calculateVectorDistance(xOffset, yOffset);
    r *= 1.5;
    r = Math.round(r / 5) * 5;
    r = Math.max(0, r);
    r = Math.min(200, r);
    return r;
  }
  reconcile(appState) {
    if (this.state !== AnchorState.UP && this.state !== AnchorState.ANCHORED)
      return;
    if (appState.anchor.position && appState.anchor.position.value) {
      this.anchorCoordinates = appState.getAnchorPosition();
      this.maxRadius = appState.anchor.maxRadius.value;
      if (this.state === AnchorState.UP) {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(this.anchorCoordinates, this.maxRadius);
      } else {
        this._toolbar.setRadius(this.maxRadius);
        this._overlay.setRadius(this.maxRadius);
      }
    } else if (this.state === AnchorState.ANCHORED) {
      this.state = AnchorState.UP;
      this._enterRaised();
    }
  }
  restoreDropped(position, radius) {
    this.state = AnchorState.ANCHORED;
    this._enterDropped(position, radius);
  }
  restoreRaised(guessPosition) {
    this.anchorCoordinates = guessPosition;
    this._enterRaised();
  }
  updateCrosshairPosition(pos) {
    if (this.state === AnchorState.ANCHORED) return;
    this.anchorCoordinates = pos;
  }
  _enterDropped(position, radius) {
    this.anchorCoordinates = position;
    this.maxRadius = parseInt(radius, 10);
    if (!(this.maxRadius > 0)) this.maxRadius = 20;
    this._toolbar.setState(this.state);
    this._toolbar.setRadius(this.maxRadius);
    this._scopePanel.hide();
    this._infoPanel.show();
    this._overlay.drop(position, this.maxRadius);
  }
  _enterRaised() {
    this._toolbar.setState(this.state);
    this._infoPanel.hide();
    this._scopePanel.show();
    this._overlay.raise(this.anchorCoordinates);
  }
};
//#endregion
//#region ui/js/ControlToolbar.js
var ControlToolbar = class {
  constructor({ parent, getMapContainer, onDrop, onRaise, onSetRadius }) {
    this._getMapContainer = getMapContainer;
    this._onDrop = onDrop;
    this._onRaise = onRaise;
    this._onSetRadius = onSetRadius;
    this._radius = 0;
    this._state = null;
    this._container = document.createElement("div");
    this._container.id = "controlToolbar";
    this._container.innerHTML = `
      <div id="anchorDown">
        <button id="raiseAnchor">Raise Anchor</button>
      </div>
      <div id="anchorUp">
        <button id="dropAnchor">Drop Anchor</button>
      </div>
      <div id="radiusControl">
        <button id="decreaseRadius">-</button>
        <button id="setRadius"><span id="radius">0</span>m</button>
        <button id="increaseRadius">+</button>
      </div>
    `;
    parent.appendChild(this._container);
    this._anchorUp = this._container.querySelector("#anchorUp");
    this._anchorDown = this._container.querySelector("#anchorDown");
    this._radiusEl = this._container.querySelector("#radius");
    this._container
      .querySelector("#raiseAnchor")
      .addEventListener("click", () => {
        if (this._state !== AnchorState.ANCHORED) return;
        if (!confirm("Do you really want to disable your anchor alarm?"))
          return;
        if (this._onRaise) this._onRaise();
      });
    this._container
      .querySelector("#dropAnchor")
      .addEventListener("click", () => {
        if (this._onDrop) this._onDrop();
      });
    this._container
      .querySelector("#setRadius")
      .addEventListener("click", () => {
        const input = prompt("Enter Radius (m)", this._radius);
        if (input === null) return;
        const newRadius = parseInt(input, 10);
        if (isNaN(newRadius) || newRadius <= 0) return;
        if (this._onSetRadius) this._onSetRadius(newRadius);
      });
    this._container
      .querySelector("#increaseRadius")
      .addEventListener("click", () => {
        if (this._onSetRadius) this._onSetRadius(this._radius + 5);
      });
    this._container
      .querySelector("#decreaseRadius")
      .addEventListener("click", () => {
        if (this._radius <= 5) return;
        if (this._onSetRadius) this._onSetRadius(this._radius - 5);
      });
    this._container.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const target = this._getMapContainer && this._getMapContainer();
        if (!target) return;
        target.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            ctrlKey: e.ctrlKey,
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: false,
            cancelable: true,
          }),
        );
      },
      { passive: false },
    );
  }
  setState(anchorState) {
    this._state = anchorState;
    const isDown =
      anchorState === AnchorState.ANCHORED ||
      anchorState === AnchorState.DROPPING;
    this._anchorDown.style.display = isDown ? "block" : "none";
    this._anchorUp.style.display = isDown ? "none" : "block";
  }
  setRadius(radius) {
    this._radius = radius;
    this._radiusEl.innerHTML = radius;
  }
};
//#endregion
//#region ui/js/AnchorAlarm.js
var POLL_INTERVAL_MS = 1e3;
var INITIAL_LOAD_RETRY_MS = 5e3;
(class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKClient({ pluginName: "hoekens-anchor-alarm" });
    this.state = new AppState();
    this.map = void 0;
    this.fleetLayer = void 0;
    this.anchorOverlay = void 0;
    this.anchorController = void 0;
    this.infoPanel = void 0;
    this.scopePanel = void 0;
    this.windPanel = void 0;
    this.homeButton = void 0;
    this.toolbar = void 0;
    this.pollTimer = null;
    this._pollInFlight = false;
  }
  static startup() {
    new AnchorAlarm().init();
  }
  init() {
    new StaleReloader({ staleThresholdMs: 300 * 1e3 }).start();
    this.satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        maxZoom: 23,
        maxNativeZoom: 17,
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
        this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const msg = `Failed to load initial data: ${error.status ? `${error.status} ` : ""}${detail}`;
        this.statusBar.setError(msg);
        console.error(msg, error);
        setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
      });
  }
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
    this.anchorController.estimateAnchorPosition(this.state);
  }
  updateMap() {
    this.windPanel.update(this.state);
    this.infoPanel.update(this.state);
    this.scopePanel.update(this.state);
    this.anchorController.reconcile(this.state);
    this.anchorOverlay.update(this.state);
    this.fleetLayer.update(this.state);
  }
  poll() {
    if (this._pollInFlight) return;
    this._pollInFlight = true;
    this.signalK
      .fetchSelf()
      .then((data) => {
        this.state.extractAll(data);
        this.state.calculate();
        this.updateMap();
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const msg = `Self update failed: ${error.status ? `${error.status} ` : ""}${detail}`;
        this.statusBar.setWarning(msg);
        console.error(msg, error);
      })
      .finally(() => {
        this._pollInFlight = false;
      });
  }
  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}).startup();
//#endregion

//# sourceMappingURL=index-CPoN2UPP.js.map
