// Leaflet map overlay controls. Each panel owns its DOM, caches element refs
// during onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks in
// style.css; do not rename without updating the stylesheet.

const StatusBar = L.Control.extend({
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

const HomeButtonControl = L.Control.extend({
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

const InfoPanel = L.Control.extend({
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

  setBelowSurface: function (value) {
    if (value === undefined || value === null) {
      this._belowSurface.textContent = "~";
      return;
    }
    this._belowSurface.textContent = `${parseFloat(value).toFixed(1)}m`;
  },

  setStatus: function (message, state) {
    this._pluginStatus.textContent = message;
    this._pluginStatus.className = "";
    if (message !== "Off" && state) {
      this._pluginStatus.classList.add(state);
    }
  },

  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});

const WindPanel = L.Control.extend({
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

  // Renders the AWS readout AND a fresh barb SVG. The SVG's rotation is set
  // from `twa` so that a setSpeed without a subsequent setAngle still points
  // the barb in the right direction.
  setSpeed: function (speedApparent, twa) {
    if (speedApparent === undefined || speedApparent === null) {
      this._aws.innerHTML = "~";
      return;
    }
    const kts = Math.round(speedApparent * MPS_TO_KNOTS);
    this._aws.innerHTML = `${kts}kts`;

    const windBarbIcon = getWindBarb(speedApparent);
    this._barb.innerHTML = windBarbIcon;
    const svg = this._barb.querySelector("svg");
    if (svg) {
      // Math.round(null) === 0, matching the original; before the first wind
      // angle arrives this paints the barb at 0° rather than no transform.
      svg.style.transform = `rotate(${Math.round(twa)}deg)`;
    }
  },

  // Re-rotates the existing barb SVG. No-op if setSpeed hasn't rendered one yet.
  setAngle: function (directionTrueDeg) {
    if (directionTrueDeg === undefined || directionTrueDeg === null) return;
    const angle = GeoMath.normalizeAngle(Math.round(directionTrueDeg));
    const svg = this._barb.querySelector("svg");
    if (svg) svg.style.transform = `rotate(${angle}deg)`;
  },

  clearSpeed: function () {
    this._aws.innerHTML = "~";
  },
});

const ScopePanel = L.Control.extend({
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

  // Render a whole scope snapshot. Caller does the math; this is pure rendering
  // plus the green/orange/red warning on the minimum-depth row.
  setScopeData: function (data) {
    const {
      depthBelowSurface,
      depthBelowKeel,
      bowHeight,
      tidalRise,
      tidalFall,
      scopes,
    } = data;

    this._belowSurface = depthBelowSurface;
    this._scopes = scopes;

    const maxHeight = depthBelowSurface + bowHeight + tidalRise;
    const minimumDepth = depthBelowKeel - tidalFall;

    this._refs.scope7to1.innerHTML = `${scopes[7].toFixed(1)}m`;
    this._refs.scope5to1.innerHTML = `${scopes[5].toFixed(1)}m`;
    this._refs.scope4to1.innerHTML = `${scopes[4].toFixed(1)}m`;
    this._refs.scope3to1.innerHTML = `${scopes[3].toFixed(1)}m`;
    this._refs.scopeDepth.innerHTML = `${depthBelowSurface.toFixed(1)}m`;
    this._refs.bowHeight.innerHTML = `${bowHeight.toFixed(1)}m`;
    this._refs.tidalRise.innerHTML = `${tidalRise.toFixed(1)}m`;
    this._refs.scopeTotal.innerHTML = `${maxHeight.toFixed(1)}m`;
    this._refs.belowKeel.innerHTML = `${depthBelowKeel.toFixed(1)}m`;
    this._refs.tidalFall.innerHTML = `${tidalFall.toFixed(1)}m`;
    this._refs.minimumDepth.innerHTML = `${minimumDepth.toFixed(1)}m`;

    if (minimumDepth > 1) {
      this._refs.minimumDepthRow.style.color = "green";
    } else if (minimumDepth > 0) {
      this._refs.minimumDepthRow.style.color = "orange";
    } else {
      this._refs.minimumDepthRow.style.color = "red";
    }
  },

  getScope: function (n) {
    return this._scopes && this._scopes[n];
  },

  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
