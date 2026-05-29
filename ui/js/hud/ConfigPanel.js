// Leaflet map overlay control: a gear button that toggles a settings dialog
// for the UI-editable plugin config. Only added to the map when the user is
// logged in (see AnchorAlarm.buildMap). Each field change immediately saves
// the whole form back through the onChange callback; the host is responsible
// for persisting to the backend. Element IDs/classes are CSS hooks in
// style.css; do not rename without updating the stylesheet.

// Form layout. Order is display order. `reload: true` flags settings that the
// running UI can't apply live (they take effect on the next page load); the
// dialog surfaces a note for those so the user isn't confused when nothing
// changes on screen.
const FIELDS = [
  { key: "enableTidePanel", label: "Show Tide Panel", type: "checkbox" },
  { key: "enableWindPanel", label: "Show Wind Panel", type: "checkbox" },
  { key: "enableScopePanel", label: "Show Scope Panel", type: "checkbox" },
  {
    key: "defaultBasemap",
    label: "Default Basemap",
    type: "select",
    options: [
      ["Satellite", "Satellite"],
      ["OpenStreetMap", "OpenStreetMap"],
    ],
    reload: true,
  },
  {
    key: "defaultShape",
    label: "Default Watch Zone Shape",
    type: "select",
    options: [
      ["circle", "Circle"],
      ["sector", "Sector"],
      ["polygon", "Polygon"],
    ],
    reload: true,
  },
  {
    key: "fleetFilterRadius",
    label: "Fleet Filter Radius (m)",
    type: "number",
    reload: true,
  },
  {
    key: "connectionType",
    label: "Connection Type",
    type: "select",
    options: [
      ["WEBSOCKET", "WebSocket"],
      ["REST_POLLING", "REST Polling"],
    ],
    reload: true,
  },
];

export const ConfigPanel = L.Control.extend({
  options: {
    position: "topleft",
    getConfig: null, // () => current config object
    getVersion: null, // () => plugin version string, shown at dialog bottom
    onChange: null, // (newConfig) => void | Promise, resolves when persisted
  },

  onAdd: function (map) {
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const button = L.DomUtil.create("a", "leaflet-control-config", container);
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-gear" viewBox="0 0 16 16">
  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/>
</svg>`;
    button.href = "#";
    button.title = "Settings";
    button.setAttribute("role", "button");

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button, "click", (e) => {
      L.DomEvent.stop(e);
      this._toggle();
    });

    this._inputs = {};
    this._buildDialog(map.getContainer());

    return container;
  },

  onRemove: function () {
    if (this._backdrop && this._backdrop.parentNode)
      this._backdrop.parentNode.removeChild(this._backdrop);
  },

  // The dialog lives as a sibling overlay inside the map container rather than
  // inside the leaflet-bar, so it can render as a centered modal independent
  // of the little gear button.
  _buildDialog: function (parent) {
    const hasReloadField = FIELDS.some((field) => field.reload);
    const reloadNote = hasReloadField
      ? `<div class="configReloadNote">* applies after reloading the page</div>`
      : "";

    const backdrop = document.createElement("div");
    backdrop.id = "configDialogBackdrop";
    backdrop.style.display = "none";
    backdrop.innerHTML = `
      <div id="configDialog">
        <div id="configDialogHeader">
          <span>Settings</span>
          <button type="button" id="configDialogClose" aria-label="Close">&times;</button>
        </div>
        <form id="configForm">
          ${FIELDS.map((field) => this._rowHtml(field)).join("")}
        </form>
        ${reloadNote}
        <div id="configStatus"></div>
        <div id="configVersion"></div>
      </div>`;

    parent.appendChild(backdrop);

    // Resolve the references the rest of the control relies on, and wire each
    // input back to the save handler now that the markup exists.
    this._status = backdrop.querySelector("#configStatus");
    this._version = backdrop.querySelector("#configVersion");
    for (const field of FIELDS) {
      const input = backdrop.querySelector(`[data-config-key="${field.key}"]`);
      this._inputs[field.key] = input;
      input.addEventListener("change", () => this._onFieldChange());
    }

    // Keep map interactions from firing while the dialog is open.
    L.DomEvent.disableClickPropagation(backdrop);
    L.DomEvent.disableScrollPropagation(backdrop);

    // Clicking the dim area (but not the dialog body) closes it.
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop)
        this._hide();
    });
    backdrop
      .querySelector("#configDialogClose")
      .addEventListener("click", () => this._hide());
    backdrop
      .querySelector("#configForm")
      .addEventListener("submit", (e) => e.preventDefault());

    this._backdrop = backdrop;
  },

  // Returns the markup for one form row. Checkboxes read left-to-right (box
  // then label); everything else stacks label above the control. Inputs carry
  // a data-config-key so _buildDialog can find them after innerHTML.
  _rowHtml: function (field) {
    const labelText = field.reload ? `${field.label} *` : field.label;
    const label = `<span class="configLabel">${labelText}</span>`;
    let control;

    if (field.type === "select") {
      const options = field.options
        .map(([value, text]) => `<option value="${value}">${text}</option>`)
        .join("");
      control = `<select class="configInput" data-config-key="${field.key}">${options}</select>`;
    } else if (field.type === "checkbox") {
      control = `<input type="checkbox" class="configInput" data-config-key="${field.key}">`;
    } else {
      control = `<input type="number" min="0" class="configInput" data-config-key="${field.key}">`;
    }

    if (field.type === "checkbox")
      return `<label class="configRow configRowCheckbox">${control}${label}</label>`;
    return `<label class="configRow">${label}${control}</label>`;
  },

  _onFieldChange: function () {
    const config = this._collect();
    this._setStatus("Saving…", "");
    let result;
    if (this.options.onChange)
      result = this.options.onChange(config);
    Promise.resolve(result)
      .then(() => this._setStatus("Saved", "configStatusOk"))
      .catch(() => this._setStatus("Save failed", "configStatusError"));
  },

  _collect: function () {
    const config = {};
    for (const field of FIELDS) {
      const input = this._inputs[field.key];
      if (field.type === "checkbox")
        config[field.key] = input.checked;
      else if (field.type === "number")
        config[field.key] = Number(input.value);
      else
        config[field.key] = input.value;
    }
    return config;
  },

  _populate: function (config) {
    for (const field of FIELDS) {
      const input = this._inputs[field.key];
      const value = config ? config[field.key] : undefined;
      if (field.type === "checkbox")
        input.checked = Boolean(value);
      else
        input.value = value ?? "";
    }
  },

  _setStatus: function (text, className) {
    if (!this._status)
      return;
    this._status.textContent = text;
    this._status.className = className || "";
    this._status.style.display = text ? "block" : "none";
  },

  _toggle: function () {
    if (this._backdrop && this._backdrop.style.display === "none")
      this._show();
    else
      this._hide();
  },

  _show: function () {
    this._populate(this.options.getConfig ? this.options.getConfig() : null);
    this._setStatus("", "");
    if (this._version) {
      const version = this.options.getVersion ? this.options.getVersion() : null;
      this._version.textContent = version ? `Hoeken's Anchor Alarm v${version}` : "";
    }
    if (this._backdrop)
      this._backdrop.style.display = "flex";
  },

  _hide: function () {
    if (this._backdrop)
      this._backdrop.style.display = "none";
  },
});
