// Leaflet map overlay control: a gear button that toggles a settings dialog
// for the UI-editable plugin config. Only added to the map when the user is
// logged in (see AnchorAlarm.buildMap). Each field change immediately saves
// the whole form back through the onChange callback; the host is responsible
// for persisting to the backend. Element IDs/classes are CSS hooks in
// style.css; do not rename without updating the stylesheet.

// Form layout. Order is display order. Every setting here applies live — the
// host's onChange pushes each change into the running UI, so none of them
// require a page reload.
import { setTitle, supportsMaplibre } from "../BrowserSupport.js";
import { Modal } from "./Modal.js";

const FIELDS = [
  { key: "enableTidePanel", label: "Show Tide Panel", type: "checkbox" },
  { key: "enableWindPanel", label: "Show Wind Panel", type: "checkbox" },
  { key: "enableScopePanel", label: "Show Scope Panel", type: "checkbox" },
  { key: "enableBoatLabels", label: "Show Boat Name Labels", type: "checkbox" },
  { key: "enableOwnTrack", label: "Show My Boat Track", type: "checkbox" },
  { key: "enableOtherTracks", label: "Show Other Boat Tracks", type: "checkbox" },
  { key: "enableChartLayers", label: "Use Chart Layers if Available", type: "checkbox" },
  // The Seascape depth overlay needs MapLibre/WebGL (see SeascapeLoader), so the
  // toggle is only offered where it can render; on the Chromium 69 MFDs it's
  // hidden rather than left as a dead switch.
  ...(supportsMaplibre()
    ? [{ key: "enableSeascape", label: "Use Seascape Bathymetry", type: "checkbox" }]
    : []),
  {
    key: "scopes",
    label: "Scope Ratios",
    type: "text",
    placeholder: "7,5,4,3",
    hint: "Comma-separated values 1–10. Leave blank to hide.",
  },
  {
    key: "defaultBasemap",
    label: "Default Basemap",
    type: "select",
    // Seascape is not a base map — it's a depth overlay that always appears in
    // the layer control when available; the "Use Seascape Bathymetry" setting
    // above only sets whether it starts on (see AnchorAlarm.addSeascapeLayer).
    options: [
      // No-tiles base for offline/slow links or crews using only their own
      // local charts (see AnchorAlarm.blankLayer).
      ["Blank", "Blank"],
      ["OpenStreetMap", "OpenStreetMap"],
      ["Satellite", "Satellite"],
    ],
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
  },
  {
    key: "fleetFilterRadius",
    label: "Fleet Filter Radius (m)",
    type: "number",
  },
];

export const ConfigPanel = L.Control.extend({
  options: {
    position: "topleft",
    getConfig: null, // () => current config object
    getVersion: null, // () => plugin version string, shown at dialog bottom
    onChange: null, // (newConfig) => void | Promise, resolves when persisted
    // Auth. When logged out the gear opens the login modal directly; when
    // logged in it opens the settings dialog, whose footer offers a Log out
    // link (the dialog is never shown to anonymous users).
    getLoggedIn: null, // () => boolean, checked on gear click
    onLogin: null, // () => void, opens the shared login modal
    onLogout: null, // () => Promise, resolves when logged out (host then reloads)
    // Custom own-boat icon. The icon isn't a schema field (it's an uploaded
    // file), so it lives outside the FIELDS-driven form and gets its own hooks.
    getIconUrl: null, // (bust) => URL of the current custom icon (GET /icon)
    onUploadIcon: null, // (file) => Promise, resolves when stored
    onDeleteIcon: null, // () => Promise, resolves when removed
  },

  onAdd: function () {
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const button = L.DomUtil.create("a", "leaflet-control-config", container);
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-gear" viewBox="0 0 16 16">
  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/>
</svg>`;
    button.href = "#";
    setTitle(button, "Settings");
    button.setAttribute("role", "button");

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button, "click", (e) => {
      L.DomEvent.stop(e);
      // Anonymous users can't persist config (the save POST is auth-gated), so
      // the gear goes straight to the login modal for them; the settings dialog
      // is only opened once logged in.
      const loggedIn = this.options.getLoggedIn
        ? this.options.getLoggedIn()
        : true;
      if (!loggedIn) {
        if (this.options.onLogin)
          this.options.onLogin();
        return;
      }
      this._toggle();
    });

    this._inputs = {};
    this._buildDialog();

    return container;
  },

  onRemove: function () {
    if (this._modal)
      this._modal.destroy();
  },

  // Build the settings form into a reusable Modal. The Modal mounts itself on
  // document.body (outside the map's stacking context), so it renders as a
  // centered, page-dimming dialog that covers the map and #controlToolbar
  // independent of the little gear button.
  _buildDialog: function () {
    this._modal = new Modal({ title: "Settings", className: "configModal" });
    this._modal.setContent(`
      <div id="configForm">
        ${FIELDS.map((field) => this._rowHtml(field)).join("")}
        ${this._iconRowHtml()}
      </div>
      <div id="configStatus"></div>`);
    // A single "Done" button (plus the header ×) closes the dialog; settings
    // persist live as each field changes, so there is nothing to submit.
    this._modal.setButtons([
      { label: "Done", variant: "primary", primary: true },
    ]);

    // Footer bottom-left, stacked: the Log out link over the version link to
    // the repo. The Done button stays pushed to the right (see
    // #configFooterMeta / #configVersion in style.css). The dialog only opens
    // when logged in, so the auth link is always Log out.
    this._modal.footer.insertAdjacentHTML(
      "afterbegin",
      `<div id="configFooterMeta">
        <a id="configLogout" href="#">Log out</a>
        <a id="configVersion" href="https://www.npmjs.com/package/hoekens-anchor-alarm" target="_blank" rel="noopener"></a>
      </div>`,
    );
    this._version = this._modal.footer.querySelector("#configVersion");
    this._modal.footer
      .querySelector("#configLogout")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this._onLogout();
      });

    const body = this._modal.body;
    this._status = body.querySelector("#configStatus");
    for (const field of FIELDS) {
      const input = body.querySelector(`[data-config-key="${field.key}"]`);
      this._inputs[field.key] = input;
      input.addEventListener("change", () => this._onFieldChange());
    }

    // Custom boat-icon controls: a preview, a hidden file input driven by an
    // Upload button, and a Delete button. See _iconRowHtml / _setIconState.
    this._iconPreview = body.querySelector("#configIconPreview");
    this._iconText = body.querySelector("#configIconText");
    this._iconFile = body.querySelector("#configIconFile");
    this._iconUploadBtn = body.querySelector("#configIconUpload");
    this._iconDeleteBtn = body.querySelector("#configIconDelete");
    this._iconStatus = body.querySelector("#configIconStatus");
    this._hasCustomIcon = false;

    this._iconUploadBtn.addEventListener("click", () => this._iconFile.click());
    this._iconFile.addEventListener("change", () => this._onIconSelected());
    this._iconDeleteBtn.addEventListener("click", () => this._onIconDelete());
  },

  // The boat-icon row. Kept out of _rowHtml/FIELDS because it's an uploaded
  // file, not a persisted schema value.
  _iconRowHtml: function () {
    return `<div class="configRow" id="configIconRow">
      <span class="configLabel">Custom Boat Icon</span>
      <div class="configIconControls">
        <div class="configIconMain">
          <img id="configIconPreview" class="configIconPreview" alt="Custom boat icon" hidden />
          <div id="configIconText" class="configIconText">
            <span id="configIconNone" class="configIconNone">No icon uploaded yet.</span>
            <span id="configIconHint" class="configHint">jpg, png, gif, or webp · max 500&nbsp;KB.</span>
          </div>
        </div>
        <div class="configIconButtons">
          <button type="button" id="configIconUpload" class="configIconBtn">Choose</button>
          <button type="button" id="configIconDelete" class="configIconBtn">Delete</button>
        </div>
        <input type="file" id="configIconFile" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
      </div>
      <div id="configIconStatus"></div>
    </div>`;
  },

  // Reflect whether a custom icon exists: show the preview (cache-busted so a
  // re-upload refreshes) or the "using default" note, and show/hide Delete.
  _setIconState: function (hasCustom) {
    this._hasCustomIcon = Boolean(hasCustom);
    const getUrl = this.options.getIconUrl;
    if (this._hasCustomIcon && getUrl) {
      this._iconPreview.src = getUrl(Date.now());
      this._iconPreview.hidden = false;
    } else {
      this._iconPreview.removeAttribute("src");
      this._iconPreview.hidden = true;
    }
    this._iconText.hidden = this._hasCustomIcon;
    this._iconDeleteBtn.hidden = !this._hasCustomIcon;
  },

  _setIconStatus: function (text, className) {
    if (!this._iconStatus)
      return;
    this._iconStatus.textContent = text || "";
    this._iconStatus.className = className || "";
    this._iconStatus.style.display = text ? "block" : "none";
  },

  _onIconSelected: function () {
    const file = this._iconFile.files && this._iconFile.files[0];
    // Reset the input so re-picking the same file fires change again.
    this._iconFile.value = "";
    if (!file)
      return;

    // Clear any prior error; success is self-evident (the icon appears), so
    // only errors get surfaced.
    this._setIconStatus("", "");
    Promise.resolve(this.options.onUploadIcon && this.options.onUploadIcon(file))
      .then(() => {
        this._setIconState(true);
      })
      .catch((err) => {
        this._setIconStatus(
          (err && err.message) || "Upload failed", "configStatusError");
      });
  },

  _onIconDelete: function () {
    this._setIconStatus("", "");
    Promise.resolve(this.options.onDeleteIcon && this.options.onDeleteIcon())
      .then(() => {
        this._setIconState(false);
      })
      .catch((err) => {
        this._setIconStatus(
          (err && err.message) || "Delete failed", "configStatusError");
      });
  },

  // Returns the markup for one form row. Checkboxes read left-to-right (box
  // then label); everything else stacks label above the control. Inputs carry
  // a data-config-key so _buildDialog can find them after innerHTML.
  _rowHtml: function (field) {
    const label = `<span class="configLabel">${field.label}</span>`;
    let control;

    if (field.type === "select") {
      const options = field.options
        .map(([value, text]) => `<option value="${value}">${text}</option>`)
        .join("");
      control = `<select class="configInput" data-config-key="${field.key}">${options}</select>`;
    } else if (field.type === "checkbox") {
      control = `<input type="checkbox" class="configInput" data-config-key="${field.key}">`;
    } else if (field.type === "text") {
      const placeholder = field.placeholder ? ` placeholder="${field.placeholder}"` : "";
      control = `<input type="text" class="configInput" data-config-key="${field.key}"${placeholder}>`;
    } else {
      control = `<input type="number" min="0" class="configInput" data-config-key="${field.key}">`;
    }

    if (field.type === "checkbox")
      return `<label class="configRow configRowCheckbox">${control}${label}</label>`;
    const hint = field.hint ? `<span class="configHint">${field.hint}</span>` : "";
    return `<label class="configRow">${label}${control}${hint}</label>`;
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
    if (this._modal && this._modal.isOpen())
      this._hide();
    else
      this._show();
  },

  _show: function () {
    const config = this.options.getConfig ? this.options.getConfig() : null;
    this._populate(config);
    this._setStatus("", "");
    this._setIconStatus("", "");
    this._setIconState(config && config.hasCustomIcon);
    if (this._version) {
      const version = this.options.getVersion ? this.options.getVersion() : null;
      this._version.textContent = version ? `Hoeken's Anchor Alarm v${version}` : "";
    }
    if (this._modal)
      this._modal.open();
  },

  // Footer Log out link: hand off to the host, which reloads on success; a
  // failure is surfaced inline since there's no reload to replace the dialog.
  _onLogout: function () {
    this._setStatus("", "");
    Promise.resolve(this.options.onLogout && this.options.onLogout()).catch(
      () => this._setStatus("Logout failed", "configStatusError"),
    );
  },

  _hide: function () {
    if (this._modal)
      this._modal.close();
  },
});
