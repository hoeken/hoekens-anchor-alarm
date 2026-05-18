// Leaflet map overlay control. Owns its DOM, caches element refs during
// onAdd, and exposes update methods so the host can drive it without
// touching the document directly. Element IDs are preserved for CSS hooks
// in style.css; do not rename without updating the stylesheet.

export const StatusBar = L.Control.extend({
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
    if (!this._container)
      return;
    this._container.textContent = text;
    this._container.style.color = color;
    this._container.style.display = "";
  },

  show: function () {
    if (this._container)
      this._container.style.display = "";
  },
  hide: function () {
    if (this._container)
      this._container.style.display = "none";
  },
});
