// The map's layer control: L.Control.Layers plus two behaviors (a backport
// of caveman-chartplotter's LayersControl, minus its route grouping — the
// anchor alarm draws no route overlays).
//
// One: the list is split into two labeled sections — "Base Layer" above the
// base-map radios and "Charts + Overlays" above the overlay checkboxes. The
// headers stand in for Leaflet's stock separator line, so that is hidden.
// Each header is styled by .leaflet-control-layers-section (see style.css):
// bold text with a rule filling the rest of the row, vertically centered on
// the text.
//
// Two: the overlays are kept alphabetically sorted. Ordering can't be left
// to insertion order: charts are added/removed dynamically as the view
// moves, so whichever scrolled into view last would otherwise land at the
// end of the list.
//
// Leaflet rebuilds the whole list on every add/remove (_update), so we
// post-process each rebuild: sort the overlay labels by name, re-append them
// under their header, and prepend the base-map header. This reads
// Leaflet-internal fields of the vendored leaflet.js (_baseLayersList,
// _overlaysList, _separator); the guards make a mismatch degrade to
// Leaflet's stock list rather than a broken control.

export const LayersControl = L.Control.Layers.extend({
  _update: function () {
    const result = L.Control.Layers.prototype._update.call(this);
    this._arrangeOverlays();
    this._labelBaseLayers();
    return result;
  },

  _arrangeOverlays: function () {
    const list = this._overlaysList;
    if (!list || !list.children.length)
      return;

    const labels = Array.from(list.children);
    labels.sort((a, b) =>
      a.textContent.trim().localeCompare(b.textContent.trim()),
    );

    // appendChild moves each label (checkbox listeners intact) into sorted
    // order below the header. _update wiped the container, so the header
    // from the last render is already gone.
    list.appendChild(this._makeHeader("Charts + Overlays"));
    for (const label of labels)
      list.appendChild(label);
  },

  _labelBaseLayers: function () {
    // The headers stand in for the base/overlay divider; Leaflet re-decides
    // the separator's display on every _update, so re-hide it each time.
    if (this._separator)
      this._separator.style.display = "none";
    const list = this._baseLayersList;
    if (list && list.children.length)
      list.insertBefore(this._makeHeader("Base Layer"), list.firstChild);
  },

  _makeHeader: function (text) {
    const header = document.createElement("div");
    header.className = "leaflet-control-layers-section";
    header.textContent = text;
    return header;
  },
});
