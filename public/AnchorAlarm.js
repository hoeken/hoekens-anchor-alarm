const MPS_TO_KNOTS = 1.94384;
const POLL_INTERVAL_MS = 1000;
const STALE_RELOAD_MS = 5 * 60 * 1000;
const MAX_OWN_TRACK_POINTS = 3600 * 24; //24 hours at 1Hz
const INITIAL_LOAD_RETRY_MS = 5000;

const AnchorState = Object.freeze({
  UP: 'UP',
  DROPPING: 'DROPPING',
  ANCHORED: 'ANCHORED',
  RAISING: 'RAISING',
});

const ANCHOR_ICON = L.icon({
  iconUrl: 'icons/anchor.png',
  iconSize: [24, 24],
  iconAnchor: [12, 4],
});

const CROSSHAIR_ICON = L.icon({
  iconUrl: 'icons/crosshair.png',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const GPS_ANTENNA_ICON = L.icon({
  iconUrl: 'icons/antenna.svg',
  iconSize: [25, 25],
  iconAnchor: [13, 25],
});

const HomeButtonControl = L.Control.extend({
  options: {
    position: 'topright',
    onHome: null,
  },

  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const homeButton = L.DomUtil.create('a', 'leaflet-control-home', container);
    homeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="0.75" class="bi bi-house" viewBox="0 0 16 16">
  <path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z"/>
</svg>`;
    homeButton.href = '#';
    homeButton.title = 'Center on Boat';
    homeButton.setAttribute('role', 'button');

    L.DomEvent.disableClickPropagation(container);
    const onHome = this.options.onHome;
    L.DomEvent.on(homeButton, 'click', function (e) {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      if (onHome) onHome(map);
    });

    return container;
  }
});

const InfoBoxControl = L.Control.extend({
  options: {
    position: 'bottomright'
  },

  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'info leaflet-bar');
    L.DomEvent.disableClickPropagation(container);
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
    container.id = "infoUI";
    return container;
  }
});

const WindBarbControl = L.Control.extend({
  options: {
    position: 'bottomright'
  },

  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'windBarbControl leaflet-bar');
    L.DomEvent.disableClickPropagation(container);
    container.innerHTML = `
      <div><b>Wind</b></div>
      <div id="windBarbContainer"></div>
      <div id="awsValue">~</div>
      `;
    container.id = "windBarbUI";
    return container;
  }
});

const ScopeBoxControl = L.Control.extend({
  options: {
    position: 'bottomright'
  },

  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'scope leaflet-bar');
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
            <th>7:1&nbspScope</th>
            <td><span id='scope7to1'>~</span></td>
          </tr>
          <tr>
            <th>5:1&nbspScope</th>
            <td><span id='scope5to1'>~</span></td>
          </tr>
          <tr>
            <th>4:1&nbspScope</th>
            <td><span id='scope4to1'>~</span></td>
          </tr>
          <tr>
            <th>3:1&nbspScope</th>
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
    return container;
  }
});

class AnchorAlarm {

  constructor() {
    this.signalK = new SignalKClient({ pluginName: 'hoekens-anchor-alarm' });

    this.heading = undefined;
    this.currentCoordinates = undefined;
    this.anchorCoordinates = undefined;
    this.filterRadius = 500;
    this.mmsi = undefined;
    this.maxRadius = 50;
    this.vessels = {};
    this.vesselTracks = {};

    this.twa = null;
    this.aws = null;

    this.boatLOA = 0;
    this.boatBeam = 0;
    this.boatAnchorRollerHeight = 0;
    this.gpsBowYDistance = 0;
    this.gpsBowXDistance = 0;
    this.aisShipType = 0;
    this.tidalRise = 0;
    this.tidalFall = 0;

    this.state = AnchorState.UP;
    this.homeZoom = undefined;

    this.myBoatMarker = undefined;
    this.gpsAntennaMarker = undefined;
    this.anchorMarker = undefined;
    this.anchorRadiusCircle = undefined;

    this.map = undefined;

    this.crosshairMarker = undefined;

    this.anchorLine = undefined;
    this.anchorLineAngle = undefined;

    this.hiddenAt = null;
    this.pollTimer = null;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  init() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
      } else if (this.hiddenAt !== null) {
        const elapsed = Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        if (elapsed >= STALE_RELOAD_MS) {
          window.location.reload();
        }
      }
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        window.location.reload();
      }
    });

    this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 23,
      maxNativeZoom: 17,      // Highest zoom level Esri has real imagery for
      tileSize: 256,
      noWrap: true,
      keepBuffer: 5
    });

    this.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data from OpenStreetMap (OSM)',
      maxZoom: 23
    });

    this.baseMaps = {
      "OpenStreetMap": this.osmLayer,
      "Satellite": this.satelliteLayer
    };

    this.wireButtons();
    this.loadInitialData();
  }

  wireButtons() {
    $('#raiseAnchor').click(() => {
      if (this.state !== AnchorState.ANCHORED) return;
      let agree = confirm('Do you really want to disable your anchor alarm?');
      if (!agree) return;
      this.state = AnchorState.RAISING;
      this.raiseAnchor(); //better UI response outside.
      this.signalK.raiseAnchor().always(() => {
        this.state = AnchorState.UP;
      });
    });

    $('#dropAnchor').click(() => {
      if (this.state !== AnchorState.UP) return;
      let mc = this.crosshairMarker.getLatLng();
      this.state = AnchorState.DROPPING;
      this.dropAnchor(mc, this.maxRadius); //better UI response outside.
      this.signalK.dropAnchor({ latitude: mc.lat, longitude: mc.lng }, this.maxRadius).always(() => {
        this.state = AnchorState.ANCHORED;
      });
    });

    $('#setRadius').click(() => {
      let input = prompt('Enter Radius (m)', this.maxRadius);
      if (input === null)
        return;
      let newRadius = parseInt(input, 10);
      if (isNaN(newRadius) || newRadius <= 0)
        return;

      this.setMaxRadius(newRadius);
    });

    $('#increaseRadius').click(() => {
      this.setMaxRadius(this.maxRadius + 5);
    });

    // macOS Chrome delivers trackpad pinch as a wheel event with ctrlKey=true.
    // Over the #map_toggle overlay the browser would zoom the page instead of
    // the map, so swallow the default and re-dispatch onto the map container.
    document.getElementById('map_toggle').addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.map.getContainer().dispatchEvent(new WheelEvent('wheel', {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: false,
        cancelable: true,
      }));
    }, { passive: false });

    $('#decreaseRadius').click(() => {
      if (this.maxRadius <= 5)
        return;
      this.setMaxRadius(this.maxRadius - 5);
    });
  }

  //this is our initial data lookup call.  Needs to happen first.
  loadInitialData() {
    this.signalK.fetchSelf().done((data) => {
      this.mmsi = data.mmsi;

      //anchor distance guess...
      let anchorDistanceGuess = 0;

      //a couple different depths
      const belowKeel = SignalKClient.freshValue(data, 'environment.depth.belowKeel', { fallback: 0 });
      const belowSurface = SignalKClient.freshValue(data, 'environment.depth.belowSurface', { fallback: 0 });
      this.updateDepthUI(belowSurface, belowKeel);

      //wind info.
      const directionTrue = SignalKClient.freshValue(data, 'environment.wind.directionTrue');
      if (directionTrue !== undefined) {
        this.twa = GeoMath.rad2deg(directionTrue);
        this.updateWindAngleUI(this.twa);
      }
      const speedApparent = SignalKClient.freshValue(data, 'environment.wind.speedApparent');
      if (speedApparent !== undefined)
        this.updateWindSpeedUI(speedApparent);

      //save our parameters for boat size + gps position
      const designLength = SignalKClient.value(data, 'design.length');
      if (designLength !== undefined)
        this.boatLOA = parseFloat(designLength.overall);
      const designBeam = SignalKClient.value(data, 'design.beam');
      if (designBeam !== undefined)
        this.boatBeam = parseFloat(designBeam);
      const rollerHeight = SignalKClient.value(data, 'design.bowAnchorRollerHeight');
      if (rollerHeight !== undefined)
        this.boatAnchorRollerHeight = parseFloat(rollerHeight);
      const fromBow = SignalKClient.value(data, 'sensors.gps.fromBow');
      if (fromBow !== undefined)
        this.gpsBowYDistance = fromBow;
      const fromCenter = SignalKClient.value(data, 'sensors.gps.fromCenter');
      if (fromCenter !== undefined)
        this.gpsBowXDistance = fromCenter;
      const shipType = SignalKClient.value(data, 'design.aisShipType');
      if (shipType?.id !== undefined)
        this.aisShipType = shipType.id;

      //check our tide data
      const tide = SignalKClient.extract(data, 'environment.tide');
      if (tide) {
        let currentTide = GeoMath.estimateTideHeightSmooth(tide.timeLow.value, tide.heightLow.value, tide.timeHigh.value, tide.heightHigh.value);
        this.tidalRise = tide.heightHigh.value - currentTide;
        this.tidalFall = currentTide - tide.heightLow.value;
      }

      //try to guess where to put the anchor.
      anchorDistanceGuess = this.calculateScope(5, belowSurface);

      //our radius defaults.
      this.maxRadius = anchorDistanceGuess;
      this.maxRadius += GeoMath.calculateVectorDistance(this.gpsBowXDistance, this.gpsBowYDistance);
      this.maxRadius *= 1.5;
      this.maxRadius = Math.round(this.maxRadius / 5) * 5; //multiples of 5
      this.maxRadius = Math.max(0, this.maxRadius);
      this.maxRadius = Math.min(200, this.maxRadius);

      const nav = data.navigation;
      const navPosition = SignalKClient.value(nav, 'position');
      this.currentCoordinates = L.latLng(navPosition.latitude, navPosition.longitude);

      //init our map
      this.map = L.map('map', {
        zoomControl: false,
      }).setView(this.currentCoordinates, 5);

      //default to satellite
      this.satelliteLayer.addTo(this.map);

      //add scale control
      L.control.scale({
        position: 'topleft' // Options: 'topleft', 'topright', 'bottomleft', 'bottomright'
      }).addTo(this.map);

      //add zoom control
      L.control.zoom({
        position: 'topright' // Options: 'topleft', 'topright', 'bottomleft', 'bottomright'
      }).addTo(this.map);

      //add home button
      this.map.addControl(new HomeButtonControl({
        onHome: (map) => {
          if (!this.currentCoordinates) return;
          const doPan = () => map.panTo(this.currentCoordinates);
          if (this.homeZoom != null && map.getZoom() !== this.homeZoom) {
            map.once('zoomend', doPan);
            map.setZoom(this.homeZoom);
          } else {
            doPan();
          }
        }
      }));

      //add layer control
      L.control.layers(this.baseMaps, {}, {
        position: 'topright' // Options: 'topleft', 'topright', 'bottomleft', 'bottomright'
      }).addTo(this.map);

      // Infobox for status
      this.map.addControl(new InfoBoxControl());

      // ScopeBox for scope suggestion
      this.map.addControl(new ScopeBoxControl());

      // Wind barb for status
      this.map.addControl(new WindBarbControl());

      //load up our heading.
      let heading = SignalKClient.value(nav, 'headingTrue');
      const initialAnchorPos = SignalKClient.value(nav, 'anchor.position');
      if (heading != null) {
        heading = GeoMath.rad2deg(heading);
      }
      //no heading data?  try pointing to our anchor.
      else if (initialAnchorPos) {
        this.anchorCoordinates = L.latLng(initialAnchorPos.latitude, initialAnchorPos.longitude);
        heading = Math.round(GeoMath.calculateBearing(this.currentCoordinates.lat, this.currentCoordinates.lng, this.anchorCoordinates.lat, this.anchorCoordinates.lng));
      }
      //no anchor?  into the wind then (fall back to 0 if no wind either).
      else
        heading = this.twa ?? 0;
      this.heading = heading;

      //calculate the x offset from the left side, not center
      let xOffset = this.boatBeam / 2 + this.gpsBowXDistance;

      // console.log(`xOffset: ${xOffset}`);

      //marker for our boat
      this.myBoatMarker = new L.BoatMarker(this.currentCoordinates, {
        beam: this.boatBeam,
        loa: this.boatLOA,
        gpsOffset: { x: xOffset, y: this.gpsBowYDistance },
        heading: heading,
        icon: this.getShipTypeIcon(this.aisShipType, this.boatLOA / this.boatBeam)
      }).addTo(this.map)

      //marker for our boat's antenna
      this.gpsAntennaMarker = L.marker(this.currentCoordinates, {
        icon: GPS_ANTENNA_ICON
      }).addTo(this.map);

      //our radius
      this.anchorRadiusCircle = L.circle(this.map.getCenter(), this.maxRadius, { color: 'green' });
      this.anchorRadiusCircle.addTo(this.map)
      this.uiSetRadius(this.maxRadius)

      this.anchorCoordinates = this.map.getCenter();

      this.anchorLine = L.polyline([this.currentCoordinates, this.anchorCoordinates], {
        color: 'grey',
        weight: 2
      }).addTo(this.map);

      // Invisible duplicate of anchorLine — leaflet.textpath only supports one
      // label per polyline, so we use this second polyline to carry the bearing
      // label while anchorLine carries the distance label.
      this.anchorLineAngle = L.polyline([this.currentCoordinates, this.anchorCoordinates], {
        color: 'grey',
        weight: 0
      }).addTo(this.map);

      if (initialAnchorPos) {
        this.anchorCoordinates = L.latLng(initialAnchorPos.latitude, initialAnchorPos.longitude);
        let radius = parseInt(SignalKClient.value(nav, 'anchor.maxRadius'), 10);
        // Set state before dropAnchor so uiSetRadiusColor (called inside) paints green.
        this.state = AnchorState.ANCHORED;
        this.dropAnchor(this.anchorCoordinates, radius);
      } else {
        let bowPos = GeoMath.calculateBowCoordinates(this.currentCoordinates, heading, this.gpsBowXDistance, this.gpsBowYDistance);
        let anchorPositionGuess = GeoMath.calculateDestinationPoint(bowPos.lat, bowPos.lng, heading, anchorDistanceGuess);
        this.anchorCoordinates = L.latLng(anchorPositionGuess.latitude, anchorPositionGuess.longitude);
        this.raiseAnchor();
      }

      this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);

      //zoom baby zoom.
      this.map.fitBounds(this.anchorRadiusCircle.getBounds());
      this.homeZoom = this.map.getZoom();

      //load up all the other vessels.
      this.signalK.fetchTracks(this.filterRadius).done((tracks) => {
        const mmsiRegex = /urn:mrn:imo:mmsi:(\d+)$/;
        for (let uri in tracks) {
          const match = uri.match(mmsiRegex);
          if (match) {
            let mmsi = match[1];
            let data = tracks[uri];

            if (data.coordinates[0].length) {

              let history = data.coordinates[0];

              let points = [];
              let i = 0;
              for (let position of history) {
                let lat = position[1];
                let lon = position[0];
                let distance = GeoMath.calculateDistance(this.currentCoordinates.lat, this.currentCoordinates.lng, lat, lon);

                if (distance < this.filterRadius) {
                  points.push([lat, lon, i]);
                  i++;
                }
              }

              this.vesselTracks[mmsi] = L.hotline(points, {
                color: 'red',
                weight: 1,
                min: 0,
                max: points.length,
                palette: { 0.0: 'red', 0.5: 'yellow', 1.0: 'green' },
                outlineWidth: 0,
                text: ''
              }).addTo(this.map);
            }
          }
        }
      });

      //start our interval updater
      this.pollTimer = setInterval(() => this.intervalUpdate(), POLL_INTERVAL_MS);
    }).fail((response) => {
      console.error('Failed to load initial data:', response.status, response.statusText);
      setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
    });
  }

  //live update of data
  intervalUpdate() {

    //update our position
    this.signalK.fetchSelfNavigation().done((data) => {

      if (SignalKClient.isStale(data.position)) {
        console.error("Position stale");
        return;
      }

      const position = SignalKClient.value(data, 'position');
      if (position.latitude === null || position.longitude === null) {
        console.error("Invalid position");
        console.error(data.position);
        return;
      }

      this.currentCoordinates = L.latLng(position.latitude, position.longitude);

      //load our heading value
      let heading = 0;
      const headingTrue = SignalKClient.freshValue(data, 'headingTrue');
      if (headingTrue !== undefined) {
        heading = GeoMath.rad2deg(headingTrue);
      } else {
        heading = Math.round(GeoMath.calculateBearing(this.currentCoordinates.lat, this.currentCoordinates.lng, this.anchorCoordinates.lat, this.anchorCoordinates.lng));
      }
      this.heading = heading;

      //update our markers
      this.myBoatMarker.setLatLng(this.currentCoordinates);
      this.myBoatMarker.setHeading(heading);
      this.gpsAntennaMarker.setLatLng(this.currentCoordinates);

      //add to our scribble
      const ownTrack = this.vesselTracks[this.mmsi];
      if (ownTrack) {
        ownTrack.addLatLng([this.currentCoordinates.lat, this.currentCoordinates.lng, ownTrack.getLatLngs().length]);
        ownTrack.options.max++;

        // Trim oldest points so the track doesn't grow unbounded over a long anchor watch.
        const pts = ownTrack.getLatLngs();
        if (pts.length > MAX_OWN_TRACK_POINTS) {
          const trimmed = pts.slice(-MAX_OWN_TRACK_POINTS);
          ownTrack.setLatLngs(trimmed);
          ownTrack.options.min = trimmed[0].alt;
        }
      }

      //redraw our anchor line
      this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
    });

    //what is our current status?
    this.signalK.fetchAnchorAlarm().done((alarm) => {
      const v = SignalKClient.value(alarm);
      if (!v) return;
      $('#pluginStatus').html(v.message);
      $('#pluginStatus').removeClass();
      if (v.message != 'Off')
        $('#pluginStatus').addClass(v.state);
    });

    //update our depth
    this.signalK.fetchDepth().done((data) => {
      const belowSurface = SignalKClient.value(data, 'belowSurface', 0);
      const belowKeel = SignalKClient.value(data, 'belowKeel', 0);

      this.updateDepthUI(belowSurface, belowKeel);
      this.updateScopeUI(belowSurface, belowKeel);
    }).fail(() => {
      $('#belowSurface').html("~");
      $('#belowKeel').html("~");
    });

    //update wind speed.
    this.signalK.fetchWindSpeedApparent().done((speedApparent) => {
      this.aws = speedApparent;
      this.updateWindSpeedUI(speedApparent);
    }).fail(() => {
      $('#awsValue').html("~");
    });

    //update wind angle.
    this.signalK.fetchWindDirectionTrue().done((directionTrue) => {
      this.twa = GeoMath.rad2deg(directionTrue);
      this.updateWindAngleUI(this.twa);
    }).fail(() => {
      $('#awaValue').html("~");
    });

    //update our watch status
    this.signalK.fetchAnchorState().done((anchorStatus) => {
      // Don't reconcile while a drop/raise POST is in flight — the server
      // doesn't reflect our pending change yet, so we'd flip ourselves back.
      if (this.state !== AnchorState.UP && this.state !== AnchorState.ANCHORED) return;

      const serverOn = SignalKClient.value(anchorStatus, 'state') === "on";

      if (serverOn) {
        this.maxRadius = SignalKClient.value(anchorStatus, 'maxRadius');
        const anchorPos = SignalKClient.value(anchorStatus, 'position');
        this.anchorCoordinates = L.latLng(anchorPos.latitude, anchorPos.longitude);

        if (this.state === AnchorState.UP) {
          // Flip state before dropAnchor so uiSetRadiusColor paints green.
          this.state = AnchorState.ANCHORED;
          this.dropAnchor(this.anchorCoordinates, this.maxRadius);
        } else {
          this.uiSetRadius(this.maxRadius);
        }
      } else if (this.state === AnchorState.ANCHORED) {
        this.state = AnchorState.UP;
        this.raiseAnchor();
      }
    });

    //update any other vessels and their tracks.
    this.signalK.fetchAllVessels().done((vessels) => {
      let detectedVessels = [];
      for (let key in vessels) {
        let vessel = vessels[key];
        if (vessel.mmsi == this.mmsi) {
          continue;
        }
        if (!("navigation" in vessel) || !("position" in vessel.navigation)) {
          continue;
        }

        //are they moving?
        let vessel_sog = 0;
        const sog = SignalKClient.value(vessel, 'navigation.speedOverGround');
        if (sog !== undefined)
          vessel_sog = sog * MPS_TO_KNOTS;

        //try to figure out where they are pointing
        let vessel_heading = 0;

        //heading would be best.... but it doesnt show up in AIS very often
        const vesselHeadingTrue = SignalKClient.freshValue(vessel, 'navigation.headingTrue');
        const vesselCog = SignalKClient.value(vessel, 'navigation.courseOverGroundTrue');
        if (vesselHeadingTrue !== undefined)
          vessel_heading = GeoMath.rad2deg(vesselHeadingTrue);
        //COG works, but is really wonky - lets only use when they are moving
        else if (vesselCog !== undefined && vessel_sog > 1)
          vessel_heading = GeoMath.rad2deg(vesselCog);
        //true wind angle looks the cleanest on the map
        else if (this.twa !== null)
          vessel_heading = this.twa;

        //where are they?
        let position = vessel.navigation.position.value;
        let distance = GeoMath.calculateDistance(position.latitude, position.longitude, this.currentCoordinates.lat, this.currentCoordinates.lng);

        //only show vessels in our radius
        if (distance <= this.filterRadius) {
          detectedVessels.push(vessel.mmsi);
          distance = Math.round(distance);

          //have we seen them already?
          if (vessel.mmsi in this.vessels) {
            this.vessels[vessel.mmsi].setLatLng([position.latitude, position.longitude]);
            this.vessels[vessel.mmsi].setHeading(vessel_heading);
            this.vessels[vessel.mmsi].setPopupContent(`${vessel.name} at ${distance} meters`);
            this.vessels[vessel.mmsi].gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

            //do we have a track for them?
            if (this.vesselTracks[vessel.mmsi]) {
              let lastPosition = this.vesselTracks[vessel.mmsi].getLatLngs().at(-1);
              if (lastPosition && (lastPosition.lat != position.latitude || lastPosition.lng != position.longitude)) {
                this.vesselTracks[vessel.mmsi].addLatLng([position.latitude, position.longitude, this.vesselTracks[vessel.mmsi].options.max]);
                this.vesselTracks[vessel.mmsi].options.max++;
              }
            }
            //nope, create their info
          } else {

            //default values
            let loa = 14;
            let beam = 4
            let aisShipType = 36;
            let gpsXOffset = 0;
            let gpsYOffset = 0;

            //load them if we got them.
            const aisFromCenter = SignalKClient.value(vessel, 'sensors.ais.fromCenter');
            if (aisFromCenter !== undefined)
              gpsXOffset = parseFloat(aisFromCenter);
            const aisFromBow = SignalKClient.value(vessel, 'sensors.ais.fromBow');
            if (aisFromBow !== undefined)
              gpsYOffset = parseFloat(aisFromBow);
            const vesselLength = SignalKClient.value(vessel, 'design.length');
            if (vesselLength !== undefined)
              loa = parseFloat(vesselLength.overall);
            const vesselBeam = SignalKClient.value(vessel, 'design.beam');
            if (vesselBeam !== undefined)
              beam = parseFloat(vesselBeam);
            const vesselShipType = SignalKClient.value(vessel, 'design.aisShipType');
            if (vesselShipType?.id !== undefined)
              aisShipType = vesselShipType.id;

            //calculate the x offset from the left side, not center
            let xOffset = beam / 2 + gpsXOffset;

            //create our boat marker
            this.vessels[vessel.mmsi] = new L.BoatMarker([position.latitude, position.longitude], {
              beam: beam,
              loa: loa,
              gpsOffset: { x: xOffset, y: gpsYOffset },
              heading: vessel_heading,
              icon: this.getShipTypeIcon(aisShipType, loa / beam)
            });
            this.vessels[vessel.mmsi].addTo(this.map).bindPopup(`${vessel.name} at ${distance} meters`);

            //marker for our boat's antenna
            this.vessels[vessel.mmsi].gpsAntennaMarker = L.marker([position.latitude, position.longitude], {
              icon: GPS_ANTENNA_ICON
            }).addTo(this.map);
            this.vessels[vessel.mmsi].gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

            //make sure we didnt load their track already.
            if (vessel.mmsi in this.vesselTracks === false) {
              this.vesselTracks[vessel.mmsi] = L.hotline([[position.latitude, position.longitude, 0]], {
                color: 'red',
                weight: 1,
                min: 0,
                max: 1,
                palette: { 0.0: 'red', 0.5: 'yellow', 1.0: 'green' },
                outlineWidth: 0,
                text: ''
              }).addTo(this.map);
            }
          }
        }
      }
      for (let mmsi in this.vessels) {
        if (!detectedVessels.includes(mmsi)) {
          this.map.removeLayer(this.vessels[mmsi]);
          delete this.vessels[mmsi];
          this.map.removeLayer(this.vesselTracks[mmsi]);
          delete this.vesselTracks[mmsi];
        }
      }
    });
  }

  uiSetRadius(radius) {
    $('#radius').html(radius);
    this.anchorRadiusCircle.setRadius(radius);
    this.uiSetRadiusColor()
  }

  setMaxRadius(newRadius) {
    this.maxRadius = newRadius;
    this.uiSetRadius(newRadius);

    if (this.state === AnchorState.ANCHORED) {
      this.signalK.setRadius(newRadius);
    }
  }

  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  uiSetRadiusColor() {
    const center = this.anchorRadiusCircle.getLatLng();
    const boat = this.myBoatMarker.getLatLng();
    const radius = this.anchorRadiusCircle.getRadius();
    const distance = GeoMath.calculateDistance(center.lat, center.lng, boat.lat, boat.lng);

    if (distance > radius)
      this.anchorRadiusCircle.setStyle({ color: 'red' });
    else if (this.state === AnchorState.ANCHORED || this.state === AnchorState.DROPPING)
      this.anchorRadiusCircle.setStyle({ color: 'green' });
    else
      this.anchorRadiusCircle.setStyle({ color: 'blue' });
  }

  dropAnchor(position, radius) {
    $('#anchorDown').show();
    $('#anchorUp').hide();

    this.anchorCoordinates = position;

    $('#scopeUI').hide();
    $('#infoUI').show();

    this.maxRadius = parseInt(radius, 10);
    if (this.maxRadius <= 0)
      this.maxRadius = 20;

    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = undefined;
    }

    this.anchorRadiusCircle.setLatLng(position);
    this.uiSetRadius(this.maxRadius)

    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = undefined;
    }

    this.anchorMarker = L.marker(position, {
      icon: ANCHOR_ICON
    }).addTo(this.map);
  }

  raiseAnchor() {
    $('#anchorUp').show();
    $('#anchorDown').hide();

    $('#infoUI').hide();
    $('#scopeUI').show();

    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = undefined;
    }

    this.uiSetRadiusColor();

    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = undefined;
    }

    this.crosshairMarker = L.marker(this.anchorCoordinates, {
      icon: CROSSHAIR_ICON,
      draggable: true
    }).addTo(this.map);

    this.crosshairMarker.on('drag', (ev) => {
      if (this.state !== AnchorState.ANCHORED) {
        this.anchorCoordinates = this.crosshairMarker.getLatLng();
        this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
        this.anchorRadiusCircle.setLatLng(this.crosshairMarker.getLatLng());
        this.uiSetRadiusColor();
      }
    });

    this.anchorRadiusCircle.setLatLng(this.anchorCoordinates);

    this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
  }

  updateDepthUI(dbs, dbk) {
    let output;

    if (typeof dbs !== "undefined")
      dbs = parseFloat(dbs).toFixed(1);
    else
      dbs = '~'

    if (typeof dbk !== "undefined")
      dbk = parseFloat(dbk).toFixed(1);
    else
      dbk = '~'

    $('#belowSurface').html(`${dbs}m`);
    $('#belowKeel').html(`${dbk}m`);
  }

  updateScopeUI(dbs, dbk) {

    dbs = parseFloat(dbs);
    dbk = parseFloat(dbk);

    const maxHeight = dbs + this.boatAnchorRollerHeight + this.tidalRise;
    const minimumDepth = dbk - this.tidalFall;

    $('#scope7to1').html(`${this.calculateScope(7, dbs).toFixed(1)}m`);
    $('#scope5to1').html(`${this.calculateScope(5, dbs).toFixed(1)}m`);
    $('#scope4to1').html(`${this.calculateScope(4, dbs).toFixed(1)}m`);
    $('#scope3to1').html(`${this.calculateScope(3, dbs).toFixed(1)}m`);
    $('#scopeDepth').html(`${dbs.toFixed(1)}m`);
    $('#bowHeight').html(`${this.boatAnchorRollerHeight.toFixed(1)}m`);
    $('#tidalRise').html(`${this.tidalRise.toFixed(1)}m`);
    $('#scopeTotal').html(`${maxHeight.toFixed(1)}m`);
    $('#belowKeel').html(`${dbk.toFixed(1)}m`);
    $('#tidalFall').html(`${this.tidalFall.toFixed(1)}m`);
    $('#minimumDepth').html(`${minimumDepth.toFixed(1)}m`);

    //color warning for depth.
    if (minimumDepth > 1) {
      $(".minimumDepthRow").css("color", "green")
    }
    else if (minimumDepth > 0) {
      $(".minimumDepthRow").css("color", "orange")
    }
    else {
      $(".minimumDepthRow").css("color", "red")
    }
  }

  calculateScope(scope, dbs) {

    //start with depth
    let maxHeight = dbs;

    //the height of our bow roller.
    maxHeight += this.boatAnchorRollerHeight;

    //the delta between now and high tide.
    maxHeight += this.tidalRise;

    //okay, send it back.
    let total = maxHeight * scope;

    return total;
  }

  updateWindSpeedUI(speedApparent) {
    if (typeof speedApparent !== "undefined") {
      let kts = Math.round(speedApparent * MPS_TO_KNOTS);
      $('#awsValue').html(`${kts}kts`);

      const windBarbIcon = getWindBarb(speedApparent);
      $('#windBarbContainer').html(windBarbIcon);
      $('#windBarbContainer svg').css('transform', `rotate(${Math.round(this.twa)}deg)`);
    } else {
      $('#awsValue').html('~');
    }
  }

  updateWindAngleUI(directionTrue) {
    if (typeof directionTrue !== "undefined") {
      let angle = GeoMath.normalizeAngle(Math.round(directionTrue));
      $('#awaValue').html(`${angle}°`);

      $('#windBarbContainer svg').css('transform', `rotate(${angle}deg)`);

    } else {
      $('#awaValue').html('~');
    }
  }

  updateAnchorLine(current, anchor) {

    let bowCoordinates = GeoMath.calculateBowCoordinates(current, this.heading, this.gpsBowXDistance, this.gpsBowYDistance);

    this.anchorLine.setLatLngs([bowCoordinates, anchor]);
    this.anchorLineAngle.setLatLngs([bowCoordinates, anchor]); // this duplicate on is so we can have 2 text labels

    //this will fail if you're anchored exactly on the equator, lol.
    let flip = false;
    if (bowCoordinates.lng > anchor.lng)
      flip = true;

    let distance = GeoMath.calculateDistance(bowCoordinates.lat, bowCoordinates.lng, anchor.lat, anchor.lng);
    distance = Math.round(distance * 10) / 10;

    this.anchorLine.setText("");
    this.anchorLine.setText(`${distance}m`, {
      orientation: flip ? 'flip' : 0,
      offset: 12,
      center: true,
      attributes: {
        class: "anchorLineLabel"
      }
    });

    const bearing = Math.round(GeoMath.calculateBearing(bowCoordinates.lat, bowCoordinates.lng, anchor.lat, anchor.lng));

    this.anchorLineAngle.setText("");
    this.anchorLineAngle.setText(`${bearing}°`, {
      orientation: flip ? 'flip' : 0,
      offset: -3,
      center: true,
      attributes: {
        class: "anchorLineLabel"
      }
    });

  }

  getShipTypeIcon(aisShipType, aspectRatio) {
    aisShipType = parseInt(aisShipType, 10);

    // Sailing: pick monohull vs catamaran by hull aspect ratio.
    if (aisShipType === 36)
      return aspectRatio >= 2.5
        ? "icons/ships/png/sailboat.png"
        : "icons/ships/png/catamaran.png";

    const range = AnchorAlarm.SHIP_TYPE_RANGES.find(
      r => aisShipType >= r.start && aisShipType <= r.end
    );

    return range
      ? `icons/ships/png/${range.icon}`
      : "icons/ships/png/default.png";
  }

}

// AIS ship-type code → icon filename (under icons/ships/png/).
// Code 36 (sailing) is handled separately to switch on hull aspect ratio.
// Codes 0, 1-19, 38, 39, 56, 57 are unmapped and fall through to default.png.
AnchorAlarm.SHIP_TYPE_RANGES = [
  { start: 20, end: 29, icon: 'wing-in-ground.png' },   // Wing in ground (WIG)
  { start: 30, end: 30, icon: 'fishing.png' },
  { start: 31, end: 32, icon: 'towing.png' },
  { start: 33, end: 33, icon: 'dredging.png' },
  { start: 34, end: 34, icon: 'diving.png' },
  { start: 35, end: 35, icon: 'military.png' },
  { start: 37, end: 37, icon: 'pleasure.png' },
  { start: 40, end: 49, icon: 'high-speed-craft.png' }, // High speed craft (HSC)
  { start: 50, end: 50, icon: 'pilot.png' },
  { start: 51, end: 51, icon: 'sar.png' },
  { start: 52, end: 52, icon: 'tug.png' },
  { start: 53, end: 53, icon: 'port-tender.png' },
  { start: 54, end: 54, icon: 'anti-pollution.png' },
  { start: 55, end: 55, icon: 'police.png' },
  { start: 58, end: 58, icon: 'medical.png' },
  { start: 59, end: 59, icon: 'noncombatant.png' },
  { start: 60, end: 69, icon: 'passenger.png' },
  { start: 70, end: 79, icon: 'cargo.png' },
  { start: 80, end: 89, icon: 'tanker.png' },
  { start: 90, end: 99, icon: 'other.png' },
];

$(() => AnchorAlarm.startup());
