/*
 * Antimeridian world-copy fix for single-copy Leaflet layers.
 *
 * Leaflet draws markers, tooltips (our boat-name labels) and popups in a single
 * world copy: each projects its raw longitude through L.Map#latLngToLayerPoint
 * (which never wraps) and only re-positions on zoom/viewreset — never on a plain
 * pan. With `worldCopyJump` enabled (see AnchorAlarm map init) the map pane
 * shifts by a whole world when you pan across the 180° line, so these layers get
 * left behind in the old copy and vanish off the far side. This is the same
 * class of bug already fixed for hotline tracks in leaflet.hotline.js.
 *
 * This patch makes markers and overlays (a) draw in the world copy nearest the
 * current map center, and (b) re-position on `moveend` so they follow across the
 * seam. Only which 360°-copy of the world a layer draws in changes; its stored
 * latlng — and therefore getLatLng(), distance/bearing math, etc. — is left
 * untouched (temporarily swapped during projection, then restored).
 *
 * Loaded as a plain script after leaflet.js so it patches the core prototypes
 * before the app creates any layers.
 */
(function (L) {
  if (!L || L.__antimeridianPatched) {
    return;
  }
  L.__antimeridianPatched = true;

  // Shift latlng's longitude in whole 360° steps to within ±180° of centerLng,
  // so the layer draws in the world copy the viewport is showing. Returns the
  // same object when no shift is needed (the common case) to avoid allocation.
  function wrapLatLng(centerLng, latlng) {
    var lng = latlng.lng + 360 * Math.round((centerLng - latlng.lng) / 360);
    return lng === latlng.lng ? latlng : L.latLng(latlng.lat, lng);
  }

  // Wrap a positioning method so that, for the duration of the original call,
  // this._latlng is the center-nearest copy. centerLngFor derives the reference
  // longitude: the live map center for pan/zoom-end/reset, or the animation's
  // target center for a zoom animation frame.
  function wrapMethod(Cls, method, centerLngFor) {
    var orig = Cls && Cls.prototype && Cls.prototype[method];
    if (!orig) {
      return;
    }
    Cls.prototype[method] = function (arg) {
      var real = this._latlng;
      if (!this._map || !real) {
        return orig.call(this, arg);
      }
      this._latlng = wrapLatLng(centerLngFor(this, arg), real);
      try {
        return orig.call(this, arg);
      } finally {
        this._latlng = real;
      }
    };
  }

  // Add a `moveend` handler (calling the layer's own re-position method) to a
  // class's map-event registration, so the layer re-projects on pan and not
  // only on zoom/viewreset.
  function repositionOnMoveEnd(Cls, method) {
    var orig = Cls && Cls.prototype && Cls.prototype.getEvents;
    if (!orig) {
      return;
    }
    Cls.prototype.getEvents = function () {
      var events = orig.call(this);
      events.moveend = this[method];
      return events;
    };
  }

  var viewCenterLng = function (layer) {
    return layer._map.getCenter().lng;
  };
  var animCenterLng = function (layer, opt) {
    return opt.center.lng;
  };

  // Markers: boat icons (L.BoatMarker) and the GPS antenna dots (L.marker).
  wrapMethod(L.Marker, "update", viewCenterLng);
  wrapMethod(L.Marker, "_animateZoom", animCenterLng);
  repositionOnMoveEnd(L.Marker, "update");

  // Overlays: boat-name labels (L.Tooltip) and vessel-info popups (L.Popup).
  // Each subclass keeps its own _updatePosition, so patch both leaves.
  [L.Popup, L.Tooltip].forEach(function (Cls) {
    wrapMethod(Cls, "_updatePosition", viewCenterLng);
    wrapMethod(Cls, "_animateZoom", animCenterLng);
    repositionOnMoveEnd(Cls, "_updatePosition");
  });

  // Vector layers: the anchor rode (L.Polyline), the sector/polygon watch zones
  // (L.Polygon), and the circle watch zone (L.Circle). Unlike markers these are
  // driven by their renderer, which re-clips/redraws them on moveend but only
  // re-projects on zoom/viewreset — so a plain pan leaves their cached projected
  // points behind, exactly like the hotline tracks. Fix both by wrapping each
  // point to the nearest world copy at projection time and re-projecting from
  // _update (which the renderer calls on every view change, moveend included).

  // Re-project before the original _update so the cached geometry is rebuilt in
  // the world copy nearest the current center on every pan/zoom/reset.
  function reprojectOnUpdate(Cls) {
    var orig = Cls && Cls.prototype && Cls.prototype._update;
    if (!orig) {
      return;
    }
    Cls.prototype._update = function () {
      if (!this._map) {
        return;
      }
      this._project();
      return orig.call(this);
    };
  }

  // L.Polyline/L.Polygon project an array of rings; wrap each point in the flat
  // (leaf) rings to the copy nearest the map center. Mirrors Leaflet's own
  // _projectLatlngs, adding only the per-point longitude wrap. (L.Hotline keeps
  // its own _projectLatlngs — it also carries a z/gradient coordinate — but
  // inherits the _update re-projection patched here.)
  L.Polyline.prototype._projectLatlngs = function (
    latlngs,
    result,
    projectedBounds,
  ) {
    var flat = latlngs.length > 0 && latlngs[0] instanceof L.LatLng;
    if (flat && this._map) {
      var centerLng = this._map.getCenter().lng;
      var ring = [];
      for (var i = 0; i < latlngs.length; i++) {
        ring[i] = this._map.latLngToLayerPoint(
          wrapLatLng(centerLng, latlngs[i]),
        );
        projectedBounds.extend(ring[i]);
      }
      result.push(ring);
    } else {
      for (var j = 0; j < latlngs.length; j++) {
        this._projectLatlngs(latlngs[j], result, projectedBounds);
      }
    }
  };
  reprojectOnUpdate(L.Polyline);

  // Circles project their single center latlng (and derive a copy-invariant
  // pixel radius from it), so the same swap-during-projection trick used for
  // markers applies. L.Circle overrides _project; L.CircleMarker is its base and
  // supplies the shared _update.
  wrapMethod(L.CircleMarker, "_project", viewCenterLng);
  wrapMethod(L.Circle, "_project", viewCenterLng);
  reprojectOnUpdate(L.CircleMarker);
})(typeof window !== "undefined" ? window.L : this.L);
