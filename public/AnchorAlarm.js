class AnchorAlarm {

  constructor() {
    this._heading = undefined;
    this._currentCoordinates = undefined;
    this._anchorCoordinates = undefined;
    this._filterRadius = 500;
    this._mmsi = undefined;
    this._maxRadius = 50;
    this._vessels = {};
    this._vesselTracks = {};

    this._twa = false;
    this._aws = false;

    this._boatLOA = 0;
    this._boatBeam = 0;
    this._boatAnchorRollerHeight = 0;
    this._gpsBowYDistance = 0;
    this._gpsBowXDistance = 0;
    this._aisShipType = 0;
    this._tidalRise = 0;
    this._tidalFall = 0;

    this._isAnchored = false;
    this._waitingForTheDrop = false;
    this._homeZoom = undefined;

    this._windBarb = false;
    this.myBoatMarker = undefined;
    this.gpsAntennaMarker = undefined;
    this.anchorMarker = undefined;
    this.anchorRadiusCircle = undefined;

    this.map = undefined;

    this.anchorIcon = L.icon({
      iconUrl: 'icons/anchor.png',
      iconSize: [24, 24], // size of the icon
      iconAnchor: [12, 4], // point of the icon which will correspond to marker's location
    });

    this.crosshairIcon = L.icon({
      iconUrl: 'icons/crosshair.png',
      iconSize: [24, 24], // size of the icon
      iconAnchor: [12, 12], // point of the icon which will correspond to marker's location
    });

    this.crosshairMarker = L.marker({
      icon: this.crosshairIcon
    });

    this.gpsAntennaIcon = L.icon({
      iconUrl: 'icons/antenna.svg',
      iconSize: [25, 25], // size of the icon
      iconAnchor: [13, 25], // point of the icon which will correspond to marker's location
    });

    this.anchorLine = undefined;
    this.anchorLineAngle = undefined;

    this.urlParams = new URLSearchParams(window.location.search);

    this._hiddenAt = null;
  }

  static startup() {
    const app = new AnchorAlarm();
    app.init();
  }

  init() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._hiddenAt = Date.now();
      } else if (this._hiddenAt !== null) {
        const elapsed = Date.now() - this._hiddenAt;
        this._hiddenAt = null;
        if (elapsed >= AnchorAlarm.STALE_RELOAD_MS) {
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

    this._wireButtons();
    this._loadInitialData();
  }

  _wireButtons() {
    $('#raiseAnchor').click(() => {
      let agree = confirm('Do you really want to disable your anchor alarm?');
      if (agree) {
        this._waitingForTheDrop = true;
        this.raiseAnchor(); //better UI response outside.
        $.post('/plugins/hoekens-anchor-alarm/raiseAnchor', () => { }).fail((response) => {
        }).fail((response) => {
          if (response.status == 401)
            location.href = "/admin/#/login";
        }).always(() => {
          this._waitingForTheDrop = false;
        });
      }
    });

    $('#dropAnchor').click(() => {
      //let mc = map.getCenter()
      let mc = this.crosshairMarker.getLatLng();
      this._waitingForTheDrop = true;
      this.dropAnchor(mc, this._maxRadius); //better UI response outside.
      let newPosition = { latitude: mc.lat, longitude: mc.lng };
      $.post('/plugins/hoekens-anchor-alarm/dropAnchor', { position: newPosition, radius: this._maxRadius }, () => {
      }).fail((response) => {
        if (response.status == 401)
          location.href = "/admin/#/login";
      }).always(() => {
        this._waitingForTheDrop = false;
      });
    });

    $('#setRadius').click(() => {
      let input = prompt('Enter Radius (m)', this._maxRadius);
      if (input === null)
        return;
      let newRadius = parseInt(input);
      if (isNaN(newRadius) || newRadius <= 0)
        return;

      this._maxRadius = newRadius;
      this.uiSetRadius(newRadius);

      if (this._isAnchored) {
        this._waitingForTheDrop = true;
        $.post('/plugins/hoekens-anchor-alarm/setRadius', { radius: newRadius })
          .fail((response) => {
            if (response.status == 401)
              location.href = "/admin/#/login";
          })
          .always(() => {
            this._waitingForTheDrop = false;
          });
      }

    });

    $('#increaseRadius').click(() => {
      this._maxRadius = parseInt(this._maxRadius) + 5;
      this.uiSetRadius(this._maxRadius);

      if (this._isAnchored) {
        this._waitingForTheDrop = true;
        $.post('/plugins/hoekens-anchor-alarm/setRadius', { radius: this._maxRadius })
          .fail((response) => {
            if (response.status == 401)
              location.href = "/admin/#/login";
          })
          .always(() => {
            this._waitingForTheDrop = false;
          });
      }
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
      this._maxRadius = parseInt(this._maxRadius);
      if (this._maxRadius <= 5)
        return;

      this._maxRadius = this._maxRadius - 5;
      this.uiSetRadius(this._maxRadius)

      if (this._isAnchored) {
        this._waitingForTheDrop = true;
        $.post('/plugins/hoekens-anchor-alarm/setRadius', { radius: this._maxRadius })
          .fail((response) => {
            if (response.status == 401)
              location.href = "/admin/#/login";
          })
          .always(() => {
            this._waitingForTheDrop = false;
          });
      }
    });
  }

  _buildControls() {
    const self = this;

    const HomeButtonControl = L.Control.extend({
      options: {
        position: 'topright'
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
        L.DomEvent.on(homeButton, 'click', function (e) {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          if (self._currentCoordinates) {
            const doPan = function () {
              map.panTo(self._currentCoordinates);
            };
            if (self._homeZoom != null && map.getZoom() !== self._homeZoom) {
              map.once('zoomend', doPan);
              map.setZoom(self._homeZoom);
            } else {
              doPan();
            }
          }
        });

        return container;
      }
    });

    // Define the info box control
    const InfoBoxControl = L.Control.extend({
      options: {
        position: 'bottomright' // 'topleft', 'topright', 'bottomleft', 'bottomright'
      },

      onAdd: function (map) {
        // Create a container div with a class
        const container = L.DomUtil.create('div', 'info leaflet-bar');

        // Prevent events from being propagated to the map
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

    // Define the info box control
    const WindBarbControl = L.Control.extend({
      options: {
        position: 'bottomright' // 'topleft', 'topright', 'bottomleft', 'bottomright'
      },

      onAdd: function (map) {
        // Create a container div with a class
        const container = L.DomUtil.create('div', 'windBarbControl leaflet-bar');

        // Prevent events from being propagated to the map
        L.DomEvent.disableClickPropagation(container);

        container.innerHTML = `
          <div><b>Wind</b></div>
          <div id="windBarbContainer"></div>
          <div id="awsValue">~</span>
          `;

        container.id = "windBarbUI";

        return container;
      }
    });

    // Define the info box control
    const ScopeBoxControl = L.Control.extend({
      options: {
        position: 'bottomright' // 'topleft', 'topright', 'bottomleft', 'bottomright'
      },

      onAdd: function (map) {
        // Create a container div with a class
        const container = L.DomUtil.create('div', 'scope leaflet-bar');

        // Prevent events from being propagated to the map
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

    return { HomeButtonControl, InfoBoxControl, WindBarbControl, ScopeBoxControl };
  }

  //this is our initial data lookup call.  Needs to happen first.
  _loadInitialData() {
    $.get('/signalk/v1/api/vessels/self', (data) => {
      this._mmsi = data.mmsi;

      //anchor distance guess...
      let anchorDistanceGuess = 0;

      //a couple different depths
      let belowKeel = 0;
      let belowSurface = 0;
      if (typeof data.environment.depth?.belowKeel?.value !== "undefined" && this.isFresh(data.environment.depth.belowKeel))
        belowKeel = data.environment.depth.belowKeel.value;
      if (typeof data.environment.depth?.belowSurface?.value !== "undefined" && this.isFresh(data.environment.depth.belowSurface))
        belowSurface = data.environment.depth.belowSurface.value;
      this.updateDepthUI(belowSurface, belowKeel);

      //wind info.
      if (typeof data.environment.wind?.directionTrue?.value !== "undefined" && this.isFresh(data.environment.wind.directionTrue)) {
        this._twa = this.rad2deg(data.environment.wind.directionTrue.value);
        this.updateWindAngleUI(this._twa);
      }
      if (typeof data.environment.wind?.speedApparent?.value !== "undefined" && this.isFresh(data.environment.wind.speedApparent))
        this.updateWindSpeedUI(data.environment.wind.speedApparent.value);

      //save our parameters for boat size + gps position
      if (typeof data.design?.length?.value !== "undefined")
        this._boatLOA = parseFloat(data.design.length.value.overall);
      if (typeof data.design?.beam?.value !== "undefined")
        this._boatBeam = parseFloat(data.design.beam?.value);
      if (typeof data.design?.bowAnchorRollerHeight?.value !== "undefined")
        this._boatAnchorRollerHeight = parseFloat(data.design.bowAnchorRollerHeight?.value);
      if (typeof data.sensors?.gps?.fromBow?.value !== "undefined")
        this._gpsBowYDistance = data.sensors.gps.fromBow.value;
      if (typeof data.sensors?.gps?.fromCenter?.value !== "undefined")
        this._gpsBowXDistance = data.sensors.gps.fromCenter.value;
      if (typeof data.design?.aisShipType?.value?.id !== "undefined")
        this._aisShipType = data.design.aisShipType.value.id;

      // console.log(`loa: ${this._boatLOA}`);
      // console.log(`beam: ${this._boatBeam}`);
      // console.log(`bowXDistance: ${this._gpsBowXDistance}`);
      // console.log(`bowYDistance: ${this._gpsBowYDistance}`);

      //check our tide data
      if (typeof data.environment?.tide !== "undefined") {
        let currentTide = this.estimateTideHeightSmooth(data.environment.tide.timeLow.value, data.environment.tide.heightLow.value, data.environment.tide.timeHigh.value, data.environment.tide.heightHigh.value);
        this._tidalRise = data.environment.tide.heightHigh.value - currentTide;
        this._tidalFall = currentTide - data.environment.tide.heightLow.value;
      }

      //try to guess where to put the anchor.
      anchorDistanceGuess = this.calculateScope(5, belowSurface);

      //our radius defaults.
      this._maxRadius = anchorDistanceGuess;
      this._maxRadius += this.calculateVectorDistance(this._gpsBowXDistance, this._gpsBowYDistance);
      this._maxRadius *= 1.5;
      this._maxRadius = Math.round(this._maxRadius / 5) * 5; //multiples of 5
      this._maxRadius = Math.max(0, this._maxRadius);
      this._maxRadius = Math.min(200, this._maxRadius);

      data = data.navigation;
      this._currentCoordinates = L.latLng(data.position.value.latitude, data.position.value.longitude);

      //init our map
      this.map = L.map('map', {
        zoomControl: false,
      }).setView(this._currentCoordinates, 5);

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

      const { HomeButtonControl, InfoBoxControl, WindBarbControl, ScopeBoxControl } = this._buildControls();

      //add home button
      this.map.addControl(new HomeButtonControl());

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
      let heading = data.headingTrue?.value;
      if (heading) {
        heading = this.rad2deg(heading);
      }
      //no heading data?  try pointing to our anchor.
      else if ((data.anchor) && (data.anchor.position) && (data.anchor.position.value)) {
        let anchorPosition = data.anchor.position.value;
        this._anchorCoordinates = L.latLng(anchorPosition.latitude, anchorPosition.longitude);
        heading = Math.round(this.calculateBearing(this._currentCoordinates.lat, this._currentCoordinates.lng, this._anchorCoordinates.lat, this._anchorCoordinates.lng));
      }
      //no anchor?  into the wind then.
      else
        heading = this._twa;
      this._heading = heading;

      //calculate the x offset from the left side, not center
      let xOffset = this._boatBeam / 2 + this._gpsBowXDistance;

      // console.log(`xOffset: ${xOffset}`);

      //marker for our boat
      this.myBoatMarker = new L.BoatMarker(this._currentCoordinates, {
        beam: this._boatBeam,
        loa: this._boatLOA,
        gpsOffset: { x: xOffset, y: this._gpsBowYDistance },
        heading: heading,
        icon: this.getShipTypeIcon(this._aisShipType, this._boatLOA / this._boatBeam)
      }).addTo(this.map)

      //marker for our boat's antenna
      this.gpsAntennaMarker = L.marker(this._currentCoordinates, {
        icon: this.gpsAntennaIcon
      }).addTo(this.map);

      //our radius
      this.anchorRadiusCircle = L.circle(this.map.getCenter(), this._maxRadius, { color: 'green' });
      this.anchorRadiusCircle.addTo(this.map)
      this.uiSetRadius(this._maxRadius)

      this._anchorCoordinates = this.map.getCenter();

      this.anchorLine = L.polyline([this._currentCoordinates, this._anchorCoordinates], {
        color: 'grey',
        weight: 2
      }).addTo(this.map);

      this.anchorLineAngle = L.polyline([this._currentCoordinates, this._anchorCoordinates], {
        color: 'grey',
        weight: 0
      }).addTo(this.map);

      if ((data.anchor) && (data.anchor.position) && (data.anchor.position.value)) {
        let anchorPosition = data.anchor.position.value;
        this._anchorCoordinates = L.latLng(anchorPosition.latitude, anchorPosition.longitude);
        let radius = parseInt(data.anchor.maxRadius.value);
        this.dropAnchor(this._anchorCoordinates, radius);
      } else {
        let bowPos = this.calculateBowCoordinates(this._currentCoordinates, heading, this._gpsBowXDistance, this._gpsBowYDistance);
        let anchorPositionGuess = this.calculateDestinationPoint(bowPos.lat, bowPos.lng, heading, anchorDistanceGuess);
        this._anchorCoordinates = L.latLng(anchorPositionGuess.latitude, anchorPositionGuess.longitude);
        this.raiseAnchor();
      }

      this.updateAnchorLine(this._currentCoordinates, this._anchorCoordinates);

      //zoom baby zoom.
      this.map.fitBounds(this.anchorRadiusCircle.getBounds());
      this._homeZoom = this.map.getZoom();

      //load up all the other vessels.
      $.get(`/signalk/v1/api/tracks?radius=${this._filterRadius}`, (tracks) => {
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
                let distance = this.calculateDistance(this._currentCoordinates.lat, this._currentCoordinates.lng, lat, lon);

                if (distance < this._filterRadius) {
                  points.push([lat, lon, i]);
                  i++;
                }
              }

              this._vesselTracks[mmsi] = L.hotline(points, {
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
      setInterval(() => this.intervalUpdate(), 1000);
    });
  }

  //live update of data
  intervalUpdate() {

    //update our position
    $.get('/signalk/v1/api/vessels/self/navigation', (data) => {

      // console.log(data);

      if (this.isStale(data.position)) {
        console.error("Position stale");
        return;
      }

      if (data.position.value.latitude === null || data.position.value.longitude === null) {
        console.error("Invalid position");
        console.error(data.position);
        return;
      }

      this._currentCoordinates = L.latLng(data.position.value.latitude, data.position.value.longitude);

      //load our heading value
      let heading = 0;
      if (data.headingTrue && this.isFresh(data.headingTrue)) {
        heading = this.rad2deg(data.headingTrue.value);
      } else {
        heading = Math.round(this.calculateBearing(this._currentCoordinates.lat, this._currentCoordinates.lng, this._anchorCoordinates.lat, this._anchorCoordinates.lng));
      }
      this._heading = heading;

      //update our markers
      this.myBoatMarker.setLatLng(this._currentCoordinates);
      this.myBoatMarker.setHeading(heading);
      this.gpsAntennaMarker.setLatLng(this._currentCoordinates);

      //add to our scribble
      if (this._vesselTracks[this._mmsi]) {
        this._vesselTracks[this._mmsi].addLatLng([this._currentCoordinates.lat, this._currentCoordinates.lng, this._vesselTracks[this._mmsi].getLatLngs().length]);
        this._vesselTracks[this._mmsi].options.max++;
      }

      //redraw our anchor line
      this.updateAnchorLine(this._currentCoordinates, this._anchorCoordinates);
    });

    //what is our current status?
    $.get('/signalk/v1/api/vessels/self/notifications/navigation/anchor', (alarm) => {
      $('#pluginStatus').html(alarm.value.message);
      $('#pluginStatus').removeClass();
      if (alarm.value.message != 'Off')
        $('#pluginStatus').addClass(alarm.value.state);
    });

    //update our depth
    $.get('/signalk/v1/api/vessels/self/environment/depth', (data) => {
      let belowSurface = 0;
      let belowKeel = 0;
      if (data.hasOwnProperty('belowSurface'))
        belowSurface = data.belowSurface.value;
      if (data.hasOwnProperty('belowKeel'))
        belowKeel = data.belowKeel.value;

      this.updateDepthUI(belowSurface, belowKeel);
      this.updateScopeUI(belowSurface, belowKeel);
    }).fail((response) => {
      $('#belowSurface').html("~");
      $('#belowKeel').html("~");
    });

    //update wind speed.
    $.get('/signalk/v1/api/vessels/self/environment/wind/speedApparent/value', (speedApparent) => {
      this._aws = speedApparent;
      this.updateWindSpeedUI(speedApparent);
      // this.updateWindBarbUI(this._twa, this._aws);
    }).fail((response) => {
      $('#awsValue').html("~");
    });

    //update wind angle.
    $.get('/signalk/v1/api/vessels/self/environment/wind/directionTrue/value', (directionTrue) => {
      this._twa = this.rad2deg(directionTrue);
      this.updateWindAngleUI(this._twa);
      // this.updateWindBarbUI(this._twa, this._aws);
    }).fail((response) => {
      $('#awaValue').html("~");
    });

    //update our watch status
    $.get('/signalk/v1/api/vessels/self/navigation/anchor', (anchorStatus) => {
      if (!this._waitingForTheDrop) {
        if (anchorStatus.state.value === "on") {
          this._maxRadius = anchorStatus.maxRadius.value;
          this._anchorCoordinates = L.latLng(anchorStatus.position.value.latitude, anchorStatus.position.value.longitude);
          this.uiSetRadius(this._maxRadius);

          //switch to anchored?
          if (!this._isAnchored) {
            this.dropAnchor(this._anchorCoordinates, this._maxRadius);
          }
        }
        //switch off anchored?
        else if (this._isAnchored) {
          this.raiseAnchor();
        }
      }
    });

    //update any other vessels and their tracks.
    $.get('/signalk/v1/api/vessels', (vessels) => {
      let detectedVessels = [];
      for (let key in vessels) {
        let vessel = vessels[key];
        if (vessel.mmsi == this._mmsi) {
          continue;
        }
        if (!("navigation" in vessel) || !("position" in vessel.navigation)) {
          continue;
        }

        //are they moving?
        let vessel_sog = 0;
        if (typeof vessel.navigation?.speedOverGround?.value !== "undefined")
          vessel_sog = vessel.navigation.speedOverGround.value * 1.94384;

        //try to figure out where they are pointing
        let vessel_heading = 0;

        //heading would be best.... but it doesnt show up in AIS very often
        if (typeof vessel.navigation?.headingTrue?.value !== "undefined" && this.isFresh(vessel.navigation.headingTrue))
          vessel_heading = this.rad2deg(vessel.navigation.headingTrue.value);
        //COG works, but is really wonky - lets only use when they are moving
        else if (typeof vessel.navigation?.courseOverGroundTrue?.value !== "undefined" && vessel_sog > 1)
          vessel_heading = this.rad2deg(vessel.navigation.courseOverGroundTrue.value);
        //true wind angle looks the cleanest on the map
        else if (this._twa !== false)
          vessel_heading = this._twa;

        //where are they?
        let position = vessel.navigation.position.value;
        let distance = this.calculateDistance(position.latitude, position.longitude, this._currentCoordinates.lat, this._currentCoordinates.lng);

        //only show vessels in our radius
        if (distance <= this._filterRadius) {
          detectedVessels.push(vessel.mmsi);
          distance = Math.round(distance);

          //have we seen them already?
          if (vessel.mmsi in this._vessels) {
            this._vessels[vessel.mmsi].setLatLng([position.latitude, position.longitude]);
            this._vessels[vessel.mmsi].setHeading(vessel_heading);
            this._vessels[vessel.mmsi]._popup.setContent(`${vessel.name} at ${distance} meters`);
            this._vessels[vessel.mmsi].gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

            //do we have a track for them?
            if (this._vesselTracks[vessel.mmsi]) {
              let lastPosition = this._vesselTracks[vessel.mmsi].getLatLngs().at(-1);
              if (lastPosition && (lastPosition.lat != position.latitude || lastPosition.lng != position.longitude)) {
                this._vesselTracks[vessel.mmsi].addLatLng([position.latitude, position.longitude, this._vesselTracks[vessel.mmsi].options.max]);
                this._vesselTracks[vessel.mmsi].options.max++;
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
            if (typeof vessel.sensors.ais?.fromCenter?.value !== "undefined")
              gpsXOffset = parseFloat(vessel.sensors.ais.fromCenter.value);
            if (typeof vessel.sensors.ais?.fromBow?.value !== "undefined")
              gpsYOffset = parseFloat(vessel.sensors.ais.fromBow.value);
            if (typeof vessel.design?.length?.value !== "undefined")
              loa = parseFloat(vessel.design.length.value.overall);
            if (typeof vessel.design?.beam?.value !== "undefined")
              beam = parseFloat(vessel.design.beam.value);
            if (typeof vessel.design?.aisShipType?.value?.id !== "undefined")
              aisShipType = vessel.design.aisShipType.value.id;

            //calculate the x offset from the left side, not center
            let xOffset = beam / 2 + this._gpsBowXDistance;

            //create our boat marker
            this._vessels[vessel.mmsi] = new L.BoatMarker([position.latitude, position.longitude], {
              beam: beam,
              loa: loa,
              gpsOffset: { x: xOffset, y: gpsYOffset },
              heading: vessel_heading,
              icon: this.getShipTypeIcon(aisShipType, loa / beam)
            });
            this._vessels[vessel.mmsi].addTo(this.map).bindPopup(`${vessel.name} at ${distance} meters`);

            //marker for our boat's antenna
            this._vessels[vessel.mmsi].gpsAntennaMarker = L.marker([position.latitude, position.longitude], {
              icon: this.gpsAntennaIcon
            }).addTo(this.map);
            this._vessels[vessel.mmsi].gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);

            //make sure we didnt load their track already.
            if (vessel.mmsi in this._vesselTracks === false) {
              this._vesselTracks[vessel.mmsi] = L.hotline([[position.latitude, position.longitude, 0]], {
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
      for (let mmsi in this._vessels) {
        if (!detectedVessels.includes(mmsi)) {
          this.map.removeLayer(this._vessels[mmsi]);
          delete this._vessels[mmsi];
          this.map.removeLayer(this._vesselTracks[mmsi]);
          delete this._vesselTracks[mmsi];
        }
      }
    });
  }

  uiSetRadius(radius) {
    $('#radius').html(radius);
    this.anchorRadiusCircle.setRadius(radius);
    this.uiSetRadiusColor()
  }

  uiSetRadiusColor() {
    if (this.calculateDistance(this.anchorRadiusCircle.getLatLng().lat, this.anchorRadiusCircle.getLatLng().lng, this.myBoatMarker.getLatLng().lat, this.myBoatMarker.getLatLng().lng) > this.anchorRadiusCircle.getRadius())
      this.anchorRadiusCircle.setStyle({ 'color': 'red' })
    else if (this._isAnchored)
      this.anchorRadiusCircle.setStyle({ 'color': 'green' })
    else
      this.anchorRadiusCircle.setStyle({ 'color': 'blue' })
  }

  dropAnchor(position, radius) {
    $('#anchorDown').show();
    $('#anchorUp').hide();

    this._anchorCoordinates = position;

    this._isAnchored = true;

    $('#scopeUI').hide();
    $('#infoUI').show();

    this._maxRadius = parseInt(radius);
    if (this._maxRadius <= 0)
      this._maxRadius = 20;

    this.map.removeLayer(this.crosshairMarker);

    this.anchorRadiusCircle.setLatLng(position);
    this.uiSetRadius(this._maxRadius)

    this.anchorMarker = L.marker(position, {
      icon: this.anchorIcon
    }).addTo(this.map);
  }

  raiseAnchor() {
    $('#anchorUp').show();
    $('#anchorDown').hide();

    this._isAnchored = false;

    $('#infoUI').hide();
    $('#scopeUI').show();

    if (typeof this.anchorMarker != "undefined")
      this.map.removeLayer(this.anchorMarker);

    this.uiSetRadiusColor();

    this.crosshairMarker = L.marker(this._anchorCoordinates, {
      icon: this.crosshairIcon,
      draggable: true
    }).addTo(this.map);

    this.crosshairMarker.on('drag', (ev) => {
      if (!this._isAnchored) {
        this._anchorCoordinates = this.crosshairMarker.getLatLng();
        this.updateAnchorLine(this._currentCoordinates, this._anchorCoordinates);
        this.anchorRadiusCircle.setLatLng(this.crosshairMarker.getLatLng());
        this.uiSetRadiusColor();
      }
    });

    this.anchorRadiusCircle.setLatLng(this._anchorCoordinates);

    this.updateAnchorLine(this._currentCoordinates, this._anchorCoordinates);
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

    let scope;

    let maxHeight = dbs;

    //the height of our bow roller.
    maxHeight += this._boatAnchorRollerHeight;

    //the delta between now and high tide.
    maxHeight += this._tidalRise;

    scope = this.calculateScope(7, dbs);
    scope = scope.toFixed(1);
    $('#scope7to1').html(`${scope}m`);

    scope = this.calculateScope(5, dbs);
    scope = scope.toFixed(1);
    $('#scope5to1').html(`${scope}m`);

    scope = this.calculateScope(4, dbs);
    scope = scope.toFixed(1);
    $('#scope4to1').html(`${scope}m`);

    scope = this.calculateScope(3, dbs);
    scope = scope.toFixed(1);
    $('#scope3to1').html(`${scope}m`);

    let dbsDisplay = dbs.toFixed(1);
    $('#scopeDepth').html(`${dbsDisplay}m`);

    let bowHeightDisplay = this._boatAnchorRollerHeight.toFixed(1);
    $('#bowHeight').html(`${bowHeightDisplay}m`);

    let tidalRise = this._tidalRise.toFixed(1);
    $('#tidalRise').html(`${tidalRise}m`);

    maxHeight = maxHeight.toFixed(1);
    $('#scopeTotal').html(`${maxHeight}m`);

    dbk = dbk.toFixed(1);
    $('#belowKeel').html(`${dbk}m`);

    let tidalFall = this._tidalFall.toFixed(1);
    $('#tidalFall').html(`${tidalFall}m`);

    let minimumDepth = dbk - tidalFall;
    minimumDepth = minimumDepth.toFixed(1);
    $('#minimumDepth').html(`${minimumDepth}m`);

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
    maxHeight += this._boatAnchorRollerHeight;

    //the delta between now and high tide.
    maxHeight += this._tidalRise;

    //okay, send it back.
    let total = maxHeight * scope;

    return total;
  }

  updateWindSpeedUI(speedApparent) {
    if (typeof speedApparent !== "undefined") {
      let kts = Math.round(speedApparent * 1.94384);
      $('#awsValue').html(`${kts}kts`);

      const windBarbIcon = getWindBarb(speedApparent);
      $('#windBarbContainer').html(windBarbIcon);
      $('#windBarbContainer svg').css('transform', `rotate(${Math.round(this._twa)}deg)`);
      console.log(this._twa);
    } else {
      $('#awsValue').html('~');
    }
  }

  updateWindAngleUI(directionTrue) {
    if (typeof directionTrue !== "undefined") {
      let angle = Math.round(directionTrue);
      if (angle < 0)
        angle = 360 - angle;
      $('#awaValue').html(`${angle}°`);

      console.log(angle);

      $('#windBarbContainer svg').css('transform', `rotate(${Math.round(angle)}deg)`);

    } else {
      $('#awaValue').html('~');
    }
  }

  // updateWindBarbUI(directionTrue, speedApparent) {
  //   if (!this._currentCoordinates || !this._heading)
  //     return;

  //   const _bowCoordinates = this.calculateBowCoordinates(this._currentCoordinates, this._heading, this._gpsBowXDistance, this._gpsBowYDistance);

  //   if (!this._windBarb)
  //     this._windBarb = new L.WindBarb(_bowCoordinates, { speed: speedApparent, angle: directionTrue }).addTo(this.map);
  //   else {
  //     this._windBarb.setLatLng(_bowCoordinates);
  //     this._windBarb.setSpeed(speedApparent);
  //     this._windBarb.setAngle(directionTrue);
  //   }
  // }

  updateAnchorLine(current, anchor) {

    let _bowCoordinates = this.calculateBowCoordinates(current, this._heading, this._gpsBowXDistance, this._gpsBowYDistance);

    this.anchorLine.setLatLngs([_bowCoordinates, anchor]);
    this.anchorLineAngle.setLatLngs([_bowCoordinates, anchor]); // this duplicate on is so we can have 2 text labels

    //this will fail if you're anchored exactly on the equator, lol.
    let flip = false;
    if (_bowCoordinates.lng > anchor.lng)
      flip = true;

    let distance = this.calculateDistance(_bowCoordinates.lat, _bowCoordinates.lng, anchor.lat, anchor.lng);
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

    const bearing = Math.round(this.calculateBearing(_bowCoordinates.lat, _bowCoordinates.lng, anchor.lat, anchor.lng));

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
    let icon = "icons/ships/png/default.png";

    aisShipType = parseInt(aisShipType);

    // console.log(aisShipType);
    // console.log(aspectRatio);

    switch (aisShipType) {
      case 20: // Wing in ground (WIG), all ships of this type
      case 21: // Wing in ground (WIG), Hazardous category A
      case 22: // Wing in ground (WIG), Hazardous category B
      case 23: // Wing in ground (WIG), Hazardous category C
      case 24: // Wing in ground (WIG), Hazardous category D
      case 25: // Wing in ground (WIG), Reserved for future use
      case 26: // Wing in ground (WIG), Reserved for future use
      case 27: // Wing in ground (WIG), Reserved for future use
      case 28: // Wing in ground (WIG), Reserved for future use
      case 29: // Wing in ground (WIG), Reserved for future use
        icon = "icons/ships/png/wing-in-ground.png";
        break;

      case 30: // Fishing
        icon = "icons/ships/png/fishing.png";
        break;

      case 31: // Towing
      case 32: // Towing: length exceeds 200m or breadth exceeds 25m
        icon = "icons/ships/png/towing.png";
        break;

      case 33: // Dredging or underwater ops
        icon = "icons/ships/png/dredging.png";
        break;

      case 34: // Diving ops
        icon = "icons/ships/png/diving.png";
        break;

      case 35: // Military ops
        icon = "icons/ships/png/military.png";
        break;

      case 36: // Sailing
        if (aspectRatio >= 2.5)
          icon = "icons/ships/png/sailboat.png";
        else
          icon = "icons/ships/png/catamaran.png"
        break;

      case 37: // Pleasure Craft
        icon = "icons/ships/png/pleasure.png";
        break;

      case 40: // High speed craft (HSC), all ships of this type
      case 41: // High speed craft (HSC), Hazardous category A
      case 42: // High speed craft (HSC), Hazardous category B
      case 43: // High speed craft (HSC), Hazardous category C
      case 44: // High speed craft (HSC), Hazardous category D
      case 45: // High speed craft (HSC), Reserved for future use
      case 46: // High speed craft (HSC), Reserved for future use
      case 47: // High speed craft (HSC), Reserved for future use
      case 48: // High speed craft (HSC), Reserved for future use
      case 49: // High speed craft (HSC), No additional information
        icon = "icons/ships/png/high-speed-craft.png";
        break;

      case 50: // Pilot Vessel
        icon = "icons/ships/png/pilot.png";
        break;

      case 51: // Search and Rescue vessel
        icon = "icons/ships/png/sar.png";
        break;

      case 52: // Tug
        icon = "icons/ships/png/tug.png";
        break;

      case 53: // Port Tender
        icon = "icons/ships/png/port-tender.png";
        break;

      case 54: // Anti-pollution equipment
        icon = "icons/ships/png/anti-pollution.png";
        break;

      case 55: // Law Enforcement
        icon = "icons/ships/png/police.png";
        break;

      case 58: // Medical Transport
        icon = "icons/ships/png/medical.png";
        break;

      case 59: // Noncombatant ship according to RR Resolution No. 18
        icon = "icons/ships/png/noncombatant.png";
        break;

      case 60: // Passenger, all ships of this type
      case 61: // Passenger, Hazardous category A
      case 62: // Passenger, Hazardous category B
      case 63: // Passenger, Hazardous category C
      case 64: // Passenger, Hazardous category D
      case 65: // Passenger, Reserved for future use
      case 66: // Passenger, Reserved for future use
      case 67: // Passenger, Reserved for future use
      case 68: // Passenger, Reserved for future use
      case 69: // Passenger, No additional information
        icon = "icons/ships/png/passenger.png";
        break;

      case 70: // Cargo, all ships of this type
      case 71: // Cargo, Hazardous category A
      case 72: // Cargo, Hazardous category B
      case 73: // Cargo, Hazardous category C
      case 74: // Cargo, Hazardous category D
      case 75: // Cargo, Reserved for future use
      case 76: // Cargo, Reserved for future use
      case 77: // Cargo, Reserved for future use
      case 78: // Cargo, Reserved for future use
      case 79: // Cargo, No additional information
        icon = "icons/ships/png/cargo.png";
        break;

      case 80: // Tanker, all ships of this type
      case 81: // Tanker, Hazardous category A
      case 82: // Tanker, Hazardous category B
      case 83: // Tanker, Hazardous category C
      case 84: // Tanker, Hazardous category D
      case 85: // Tanker, Reserved for future use
      case 86: // Tanker, Reserved for future use
      case 87: // Tanker, Reserved for future use
      case 88: // Tanker, Reserved for future use
      case 89: // Tanker, No additional information
        icon = "icons/ships/png/tanker.png";
        break;

      case 90: // Other Type, all ships of this type
      case 91: // Other Type, Hazardous category A
      case 92: // Other Type, Hazardous category B
      case 93: // Other Type, Hazardous category C
      case 94: // Other Type, Hazardous category D
      case 95: // Other Type, Reserved for future use
      case 96: // Other Type, Reserved for future use
      case 97: // Other Type, Reserved for future use
      case 98: // Other Type, Reserved for future use
      case 99: // Other Type, no additional information
        icon = "icons/ships/png/other.png";
        break;

      // 0 	Not available (default)
      // 1-19 	Reserved for future use
      // 38 	Reserved
      // 39 	Reserved
      // 56 	Spare - Local Vessel
      // 57 	Spare - Local Vessel
      default:
        break;
    }

    return icon;
  }

  calculateBowCoordinates(current, heading, xOffset, yOffset) {
    //first do our Y along our heading.
    let bc = this.calculateDestinationPoint(current.lat, current.lng, heading, yOffset);

    //then do our X at 90 degrees.
    if (xOffset != 0)
      bc = this.calculateDestinationPoint(bc.latitude, bc.longitude, heading - 90, xOffset);

    //okay use the new bow coordinates
    return L.latLng(bc.latitude, bc.longitude);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    let R = 6371000; // Radius of the earth in m
    let dLat = this.deg2rad(lat2 - lat1);  // deg2rad below
    let dLon = this.deg2rad(lon2 - lon1);
    let a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
      ;
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c; // Distance in km
    return d;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180)
  }

  // Convert radians to degrees
  rad2deg(radians) {
    return radians * 180 / Math.PI;
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    // Convert latitude and longitude from degrees to radians
    var θa = this.deg2rad(lat1);
    var θb = this.deg2rad(lat2);
    var ΔL = this.deg2rad(lon2 - lon1);

    // Calculate X and Y using the provided formulas
    var X = Math.cos(θb) * Math.sin(ΔL);
    var Y = Math.cos(θa) * Math.sin(θb) - Math.sin(θa) * Math.cos(θb) * Math.cos(ΔL);

    // Calculate the initial bearing (β) in radians
    var β = Math.atan2(X, Y);

    // Convert the bearing from radians to degrees
    var bearing = this.rad2deg(β);

    // Normalize the bearing to be between 0° and 360°
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
  calculateDestinationPoint(lat1, lon1, bearing, distance) {

    //console.log(`lat: ${lat1}, lon: ${lon1}, bearing: ${bearing}, distance: ${distance}`);
    const R = 6371e3; // Earth's radius in meters

    // Convert input values to radians
    const φ1 = (lat1 * Math.PI) / 180;
    const λ1 = (lon1 * Math.PI) / 180;
    const θ = (bearing * Math.PI) / 180;
    const δ = distance / R; // Angular distance in radians

    // Calculate destination coordinates
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

    // Convert radians back to degrees
    const lat2 = (φ2 * 180) / Math.PI;
    const lon2 = ((λ2 * 180) / Math.PI + 540) % 360 - 180; // Normalize to [-180, +180]

    return { latitude: lat2, longitude: lon2 };
  }

  /**
   * Returns the length of the vector (x, y) from the origin.
   * @param {number} x – x-coordinate
   * @param {number} y – y-coordinate
   * @returns {number} distance from (0,0) to (x,y)
   */
  calculateVectorDistance(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
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
  estimateTideHeightSmooth(lowTime, lowHeight, highTime, highHeight, currentTime = new Date()) {
    // normalize inputs to UTC timestamps
    const tLow = (lowTime instanceof Date ? lowTime : new Date(lowTime)).getTime();
    const tHigh = (highTime instanceof Date ? highTime : new Date(highTime)).getTime();
    const tCurrent = (currentTime instanceof Date ? currentTime : new Date(currentTime)).getTime();

    let t0, h0, t1, h1;

    // console.log('time low: ' + new Date(tLow));
    // console.log('time high: ' + new Date(tHigh));
    // console.log('time current: ' + new Date(tCurrent));
    // console.log(`low height: ${lowHeight}`);
    // console.log(`high height: ${highHeight}`);

    // determine rising vs falling tide
    if (tLow < tHigh) {
      // console.log(`rising tide`);
      // rising: low → high
      if (tCurrent <= tLow) {
        // extrapolate previous high tide one half-period before the known low
        // console.log("now before low tide — extrapolating previous high")
        t0 = tLow - (tHigh - tLow); h0 = highHeight;
        t1 = tLow; h1 = lowHeight;
      } else if (tCurrent >= tHigh) {
        // extrapolate next low tide one half-period after the known high
        // console.log("now after high tide — extrapolating next low")
        t0 = tHigh; h0 = highHeight;
        t1 = tHigh + (tHigh - tLow); h1 = lowHeight;
      } else {
        t0 = tLow; h0 = lowHeight;
        t1 = tHigh; h1 = highHeight;
      }
    } else {
      // console.log(`falling tide`);
      // falling: high → low
      if (tCurrent <= tHigh) {
        // extrapolate previous low tide one half-period before the known high
        // console.log("now before high tide — extrapolating previous low")
        t0 = tHigh - (tLow - tHigh); h0 = lowHeight;
        t1 = tHigh; h1 = highHeight;
      } else if (tCurrent >= tLow) {
        // extrapolate next high tide one half-period after the known low
        // console.log("now after low tide — extrapolating next high")
        t0 = tLow; h0 = lowHeight;
        t1 = tLow + (tLow - tHigh); h1 = highHeight;
      } else {
        t0 = tHigh; h0 = highHeight;
        t1 = tLow; h1 = lowHeight;
      }
    }

    // fraction through the tide interval [0…1]
    const frac = (tCurrent - t0) / (t1 - t0);

    // sinusoidal easing: starts slow, speeds up, then slows into the end
    const sineFrac = (1 - Math.cos(Math.PI * frac)) / 2;

    // interpolated height
    const result = h0 + (h1 - h0) * sineFrac;

    // console.log(`currentHeight: ${result}`);

    return result;
  }

  isFresh(data, max_age = 300) {
    if (!data)
      return false;
    const date = new Date(data.timestamp);
    const ageInSecs = (Date.now() - date) / 1000;
    return ageInSecs <= max_age;
  }

  isStale(data, max_age = 300) {
    return !this.isFresh(data, max_age);
  }
}

AnchorAlarm.STALE_RELOAD_MS = 5 * 60 * 1000;

$(() => AnchorAlarm.startup());
