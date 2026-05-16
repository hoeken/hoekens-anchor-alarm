L.WindBarb = L.Marker.extend({
  options: {
    zoomAnimation: false,
    width: 20,             // pixel width of the barb
    height: 80,            // pixel height of the barb
    angle: 0,               // initial rotation in degrees
    speed: 0                // initial wind speed in m/s
  },

  initialize(latlng, options) {
    L.Util.setOptions(this, options);

    const icon = L.divIcon({
      className: 'leaflet-wind-barb',
      html: getWindBarb(this.options.speed),
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    });

    options.icon = icon;
    L.Marker.prototype.initialize.call(this, latlng, options);
  },

  onAdd(map) {
    L.Marker.prototype.onAdd.call(this, map);
    this._update();
  },

  // Public method to change the angle on the fly
  setAngle(deg) {
    this.options.angle = deg;

    const svg = this._icon && this._icon.querySelector('svg');
    if (svg)
      svg.style.transform = `rotate(${deg}deg)`;

    return this;
  },

  // Public method to change the wind speed on the fly (m/s)
  setSpeed(mps) {
    this.options.speed = mps;

    if (this._icon) {
      this._icon.innerHTML = getWindBarb(mps);
      this._update();
    }

    return this;
  },

  // Apply size, anchor offset and rotation (no zoom scaling)
  _update() {
    if (!this._map || !this._icon) return;

    const wPx = this.options.width;
    const hPx = this.options.height;

    // The barb's station point (dot at the base of the staff) is at
    // viewBox coords (125, 125). The viewBox itself is sized dynamically
    // per barb, so derive its pixel position from the SVG and account
    // for preserveAspectRatio="meet" padding.
    const svg = this._icon.querySelector('svg');
    let vbX = 113, vbY = 16, vbW = 28, vbH = 121;
    if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0) {
      vbX = svg.viewBox.baseVal.x;
      vbY = svg.viewBox.baseVal.y;
      vbW = svg.viewBox.baseVal.width;
      vbH = svg.viewBox.baseVal.height;
    }
    const scale = Math.min(wPx / vbW, hPx / vbH);
    const padX = (wPx - vbW * scale) / 2;
    const padY = (hPx - vbH * scale) / 2;
    const aX = Math.round(padX + (125 - vbX) * scale);
    const aY = Math.round(padY + (125 - vbY) * scale);

    Object.assign(this._icon.style, {
      width: `${wPx}px`,
      height: `${hPx}px`,
      marginLeft: `${-aX}px`,
      marginTop: `${-aY}px`,
    });

    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
      svg.style.transformOrigin = `${aX}px ${aY}px`;
    }

    this.setAngle(this.options.angle);
  }
});
