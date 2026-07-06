L.BoatMarker = L.Marker.extend({
  options: {
    zoomAnimation: false,
    beam: 0, // metres beam (x-axis, left→right)
    loa: 0, // metres length (y-axis, top→bottom)
    gpsOffset: { x: 0, y: 0 }, // metres from SVG top-left to antenna
    icon: "", // path or URL to your SVG
    fallbackIcon: "icons/ships/png/default.png", // shown if icon fails to load
    heading: 0, // initial rotation in degrees
  },

  initialize(latlng, options) {
    L.Util.setOptions(this, options);

    // console.log(`loa: ${options.loa} beam: ${options.beam} gpsOffset: ${options.gpsOffset.x}, ${options.gpsOffset.y}`);

    // Build a tiny DivIcon; we'll size it dynamically later
    const icon = L.divIcon({
      className: "leaflet-boat-marker",
      html: `<img src="${this.options.icon}" style="width:100%; height:100%; display:block;" />`,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });

    options.icon = icon;
    L.Marker.prototype.initialize.call(this, latlng, options);
  },

  onAdd(map) {
    L.Marker.prototype.onAdd.call(this, map);
    this._setupIconFallback();
    this._update(); // initial sizing & rotation
    map.on("zoom viewreset", this._update, this);
  },

  // If the icon image fails to load (missing/renamed file, 404, etc.) swap in
  // the fallback once so we never render a broken/blank boat.
  _setupIconFallback() {
    const img = this._icon && this._icon.querySelector("img");
    const fallback = this.options.fallbackIcon;
    if (!img || !fallback) return;

    const applyFallback = () => {
      // Guard against an infinite loop if the fallback itself is missing.
      if (img.src.endsWith(fallback)) return;
      img.src = fallback;
    };

    img.addEventListener("error", applyFallback);
    // The error may have already fired before this handler was attached.
    if (img.complete && img.naturalWidth === 0) applyFallback();
  },

  onRemove(map) {
    map.off("zoom viewreset", this._update, this);
    L.Marker.prototype.onRemove.call(this, map);
  },

  // Public method to change heading on the fly
  setHeading(deg) {
    this.options.heading = deg;

    // now rotate just the image
    const img = this._icon.querySelector("img");
    if (img) img.style.transform = `rotate(${deg}deg)`;

    // The name label sits above the boat's center, which swings around the
    // antenna as the boat rotates, so re-place it on every heading change.
    this._updateLabelPosition();

    return this;
  },

  // Swap the boat image in place. AIS static data (ship type, dimensions) can
  // arrive after the marker was first drawn from defaults — e.g. a WebSocket
  // position delta created the vessel before its /vessels static fetch
  // resolved — so the icon has to be correctable on the fly. The error/fallback
  // handler bound in _setupIconFallback stays attached across src changes, so a
  // bad new path still falls back.
  setBoatIcon(iconPath) {
    const img = this._icon && this._icon.querySelector("img");
    if (!img || img.getAttribute("src") === iconPath) return this;
    img.src = iconPath;
    return this;
  },

  // Change the hull geometry after creation, for the same late-static-data
  // reason as setBoatIcon (real beam/loa also decide sailboat-vs-catamaran and
  // the drawn size). No-ops unless something actually changed so the per-sync
  // tick doesn't thrash the DOM.
  setDimensions({ beam, loa, gpsOffset }) {
    if (
      this.options.beam === beam &&
      this.options.loa === loa &&
      this.options.gpsOffset.x === gpsOffset.x &&
      this.options.gpsOffset.y === gpsOffset.y
    )
      return this;
    this.options.beam = beam;
    this.options.loa = loa;
    this.options.gpsOffset = gpsOffset;
    this._update();
    return this;
  },

  // The boat icon's geometric center as a map layer point, accounting for the
  // current heading. getLatLng() tracks the GPS antenna (the marker's anchor),
  // which can sit anywhere on the hull; the center is offset from it by half
  // the icon's size and rotates about the antenna along with the image.
  getBoatCenter() {
    if (!this._map || this._wPx === undefined) return null;

    const anchor = this._map.latLngToLayerPoint(this.getLatLng());
    // Antenna→center vector in the unrotated icon frame (px).
    const dx = this._wPx / 2 - this._oX;
    const dy = this._hPx / 2 - this._oY;
    // Rotate it the same way the image is rotated (CSS rotate, clockwise).
    const rad = (this.options.heading * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    return L.point(
      anchor.x + dx * cos - dy * sin,
      anchor.y + dx * sin + dy * cos,
    );
  },

  // Bind the name label, then place it correctly straight away. The marker's
  // geometry is computed by _update() during onAdd, so by the time a tooltip
  // is bound the dimensions needed to position it are already available.
  bindTooltip(content, options) {
    L.Marker.prototype.bindTooltip.call(this, content, options);
    this._updateLabelPosition();
    return this;
  },

  // Keep a permanent "top" tooltip centered above the boat. Such a tooltip
  // anchors its bottom-center at markerPos + offset, and markerPos is the GPS
  // antenna — not the boat's center — so we offset to the center and lift the
  // label clear of the rotated icon's vertical extent.
  _updateLabelPosition() {
    const tooltip = this.getTooltip();
    if (!tooltip || !tooltip._map || this._wPx === undefined) return;

    const LABEL_GAP = 2; // px between the top of the icon and the label
    const anchor = this._map.latLngToLayerPoint(this.getLatLng());
    const center = this.getBoatCenter();

    // Half-height of the rotated wPx×hPx bounding box: the distance straight up
    // from the center to the icon's topmost point at the current heading.
    const rad = (this.options.heading * Math.PI) / 180;
    const halfExtent =
      (Math.abs(Math.sin(rad)) * this._wPx +
        Math.abs(Math.cos(rad)) * this._hPx) /
      2;

    tooltip.options.offset = [
      center.x - anchor.x,
      center.y - anchor.y - halfExtent - LABEL_GAP,
    ];
    tooltip._updatePosition();
  },

  // Recompute size, anchor and rotation
  _update() {
    if (!this._map || !this._icon) return;

    const map = this._map;
    const ll = this.getLatLng();
    const p0 = map.latLngToLayerPoint(ll);

    // Approx metres-per-degree at this latitude
    const cosLat = Math.cos((ll.lat * Math.PI) / 180);
    const mPerDegLon = 111320 * cosLat;
    const mPerDegLat = 110574;

    // Compute px width & height from metre dims
    const pW = map.latLngToLayerPoint([
      ll.lat,
      ll.lng + this.options.beam / mPerDegLon,
    ]);
    const pH = map.latLngToLayerPoint([
      ll.lat + this.options.loa / mPerDegLat,
      ll.lng,
    ]);
    let wPx = Math.abs(pW.x - p0.x);
    let hPx = Math.abs(pH.y - p0.y);

    //we want to have a minimum size
    let minHeight = 32;
    if (hPx < minHeight) {
      hPx = minHeight;
      wPx = (hPx * this.options.beam) / this.options.loa;
    }

    hPx = Math.round(hPx);
    wPx = Math.round(wPx);

    // Compute the offset in px for the GPS antenna
    const oX = Math.round((this.options.gpsOffset.x / this.options.beam) * wPx);
    const oY = Math.round((this.options.gpsOffset.y / this.options.loa) * hPx);

    // Cache the current pixel geometry so getBoatCenter()/the name label can
    // place themselves relative to the hull without recomputing it.
    this._wPx = wPx;
    this._hPx = hPx;
    this._oX = oX;
    this._oY = oY;

    // Apply to the icon’s container
    Object.assign(this._icon.style, {
      width: `${wPx}px`,
      height: `${hPx}px`,
      marginLeft: `${-oX}px`, // shift so the GPS point aligns at (0,0)
      marginTop: `${-oY}px`,
    });

    const img = this._icon.querySelector("img");
    img.style.transformOrigin = `${oX}px ${oY}px`;

    this.setHeading(this.options.heading);
  },
});
