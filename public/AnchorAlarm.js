class AnchorAlarm {

  constructor() {
    this.heading = undefined;
    this.currentCoordinates = undefined;
    this.anchorCoordinates = undefined;
    this.filterRadius = 500;
    this.mmsi = undefined;
    this.maxRadius = 50;
    this.vessels = {};
    this.vesselTracks = {};

    this.twa = false;
    this.aws = false;

    this.boatLOA = 0;
    this.boatBeam = 0;
    this.boatAnchorRollerHeight = 0;
    this.gpsBowYDistance = 0;
    this.gpsBowXDistance = 0;
    this.aisShipType = 0;
    this.tidalRise = 0;
    this.tidalFall = 0;

    this.isAnchored = false;
    this.waitingForTheDrop = false;
    this.homeZoom = undefined;

    this.windBarb = false;
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

    this.crosshairMarker = undefined;

    this.gpsAntennaIcon = L.icon({
      iconUrl: 'icons/antenna.svg',
      iconSize: [25, 25], // size of the icon
      iconAnchor: [13, 25], // point of the icon which will correspond to marker's location
    });

    this.anchorLine = undefined;
    this.anchorLineAngle = undefined;

    this.urlParams = new URLSearchParams(window.location.search);

    this.hiddenAt = null;
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

    this.wireButtons();
    this.loadInitialData();
  }

  wireButtons() {
    $('#raiseAnchor').click(() => {
      let agree = confirm('Do you really want to disable your anchor alarm?');
      if (agree) {
        this.waitingForTheDrop = true;
        this.raiseAnchor(); //better UI response outside.
        $.post('/plugins/hoekens-anchor-alarm/raiseAnchor', () => { }).fail((response) => {
        }).fail((response) => {
          if (response.status == 401)
            location.href = "/admin/#/login";
        }).always(() => {
          this.waitingForTheDrop = false;
        });
      }
    });

    $('#dropAnchor').click(() => {
      //let mc = map.getCenter()
      let mc = this.crosshairMarker.getLatLng();
      this.waitingForTheDrop = true;
      this.dropAnchor(mc, this.maxRadius); //better UI response outside.
      let newPosition = { latitude: mc.lat, longitude: mc.lng };
      $.post('/plugins/hoekens-anchor-alarm/dropAnchor', { position: newPosition, radius: this.maxRadius }, () => {
      }).fail((response) => {
        if (response.status == 401)
          location.href = "/admin/#/login";
      }).always(() => {
        this.waitingForTheDrop = false;
      });
    });

    $('#setRadius').click(() => {
      let input = prompt('Enter Radius (m)', this.maxRadius);
      if (input === null)
        return;
      let newRadius = parseInt(input);
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

  buildControls() {
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
          if (self.currentCoordinates) {
            const doPan = function () {
              map.panTo(self.currentCoordinates);
            };
            if (self.homeZoom != null && map.getZoom() !== self.homeZoom) {
              map.once('zoomend', doPan);
              map.setZoom(self.homeZoom);
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
  loadInitialData() {
    $.get('/signalk/v1/api/vessels/self', (data) => {
      this.mmsi = data.mmsi;

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
        this.twa = GeoMath.rad2deg(data.environment.wind.directionTrue.value);
        this.updateWindAngleUI(this.twa);
      }
      if (typeof data.environment.wind?.speedApparent?.value !== "undefined" && this.isFresh(data.environment.wind.speedApparent))
        this.updateWindSpeedUI(data.environment.wind.speedApparent.value);

      //save our parameters for boat size + gps position
      if (typeof data.design?.length?.value !== "undefined")
        this.boatLOA = parseFloat(data.design.length.value.overall);
      if (typeof data.design?.beam?.value !== "undefined")
        this.boatBeam = parseFloat(data.design.beam?.value);
      if (typeof data.design?.bowAnchorRollerHeight?.value !== "undefined")
        this.boatAnchorRollerHeight = parseFloat(data.design.bowAnchorRollerHeight?.value);
      if (typeof data.sensors?.gps?.fromBow?.value !== "undefined")
        this.gpsBowYDistance = data.sensors.gps.fromBow.value;
      if (typeof data.sensors?.gps?.fromCenter?.value !== "undefined")
        this.gpsBowXDistance = data.sensors.gps.fromCenter.value;
      if (typeof data.design?.aisShipType?.value?.id !== "undefined")
        this.aisShipType = data.design.aisShipType.value.id;

      // console.log(`loa: ${this.boatLOA}`);
      // console.log(`beam: ${this.boatBeam}`);
      // console.log(`bowXDistance: ${this.gpsBowXDistance}`);
      // console.log(`bowYDistance: ${this.gpsBowYDistance}`);

      //check our tide data
      if (typeof data.environment?.tide !== "undefined") {
        let currentTide = GeoMath.estimateTideHeightSmooth(data.environment.tide.timeLow.value, data.environment.tide.heightLow.value, data.environment.tide.timeHigh.value, data.environment.tide.heightHigh.value);
        this.tidalRise = data.environment.tide.heightHigh.value - currentTide;
        this.tidalFall = currentTide - data.environment.tide.heightLow.value;
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

      data = data.navigation;
      this.currentCoordinates = L.latLng(data.position.value.latitude, data.position.value.longitude);

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

      const { HomeButtonControl, InfoBoxControl, WindBarbControl, ScopeBoxControl } = this.buildControls();

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
        heading = GeoMath.rad2deg(heading);
      }
      //no heading data?  try pointing to our anchor.
      else if ((data.anchor) && (data.anchor.position) && (data.anchor.position.value)) {
        let anchorPosition = data.anchor.position.value;
        this.anchorCoordinates = L.latLng(anchorPosition.latitude, anchorPosition.longitude);
        heading = Math.round(GeoMath.calculateBearing(this.currentCoordinates.lat, this.currentCoordinates.lng, this.anchorCoordinates.lat, this.anchorCoordinates.lng));
      }
      //no anchor?  into the wind then.
      else
        heading = this.twa;
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
        icon: this.gpsAntennaIcon
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

      this.anchorLineAngle = L.polyline([this.currentCoordinates, this.anchorCoordinates], {
        color: 'grey',
        weight: 0
      }).addTo(this.map);

      if ((data.anchor) && (data.anchor.position) && (data.anchor.position.value)) {
        let anchorPosition = data.anchor.position.value;
        this.anchorCoordinates = L.latLng(anchorPosition.latitude, anchorPosition.longitude);
        let radius = parseInt(data.anchor.maxRadius.value);
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
      $.get(`/signalk/v1/api/tracks?radius=${this.filterRadius}`, (tracks) => {
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

      this.currentCoordinates = L.latLng(data.position.value.latitude, data.position.value.longitude);

      //load our heading value
      let heading = 0;
      if (data.headingTrue && this.isFresh(data.headingTrue)) {
        heading = GeoMath.rad2deg(data.headingTrue.value);
      } else {
        heading = Math.round(GeoMath.calculateBearing(this.currentCoordinates.lat, this.currentCoordinates.lng, this.anchorCoordinates.lat, this.anchorCoordinates.lng));
      }
      this.heading = heading;

      //update our markers
      this.myBoatMarker.setLatLng(this.currentCoordinates);
      this.myBoatMarker.setHeading(heading);
      this.gpsAntennaMarker.setLatLng(this.currentCoordinates);

      //add to our scribble
      if (this.vesselTracks[this.mmsi]) {
        this.vesselTracks[this.mmsi].addLatLng([this.currentCoordinates.lat, this.currentCoordinates.lng, this.vesselTracks[this.mmsi].getLatLngs().length]);
        this.vesselTracks[this.mmsi].options.max++;
      }

      //redraw our anchor line
      this.updateAnchorLine(this.currentCoordinates, this.anchorCoordinates);
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
      this.aws = speedApparent;
      this.updateWindSpeedUI(speedApparent);
      // this.updateWindBarbUI(this.twa, this.aws);
    }).fail((response) => {
      $('#awsValue').html("~");
    });

    //update wind angle.
    $.get('/signalk/v1/api/vessels/self/environment/wind/directionTrue/value', (directionTrue) => {
      this.twa = GeoMath.rad2deg(directionTrue);
      this.updateWindAngleUI(this.twa);
      // this.updateWindBarbUI(this.twa, this.aws);
    }).fail((response) => {
      $('#awaValue').html("~");
    });

    //update our watch status
    $.get('/signalk/v1/api/vessels/self/navigation/anchor', (anchorStatus) => {
      if (!this.waitingForTheDrop) {
        if (anchorStatus.state.value === "on") {
          this.maxRadius = anchorStatus.maxRadius.value;
          this.anchorCoordinates = L.latLng(anchorStatus.position.value.latitude, anchorStatus.position.value.longitude);
          this.uiSetRadius(this.maxRadius);

          //switch to anchored?
          if (!this.isAnchored) {
            this.dropAnchor(this.anchorCoordinates, this.maxRadius);
          }
        }
        //switch off anchored?
        else if (this.isAnchored) {
          this.raiseAnchor();
        }
      }
    });

    //update any other vessels and their tracks.
    $.get('/signalk/v1/api/vessels', (vessels) => {
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
        if (typeof vessel.navigation?.speedOverGround?.value !== "undefined")
          vessel_sog = vessel.navigation.speedOverGround.value * 1.94384;

        //try to figure out where they are pointing
        let vessel_heading = 0;

        //heading would be best.... but it doesnt show up in AIS very often
        if (typeof vessel.navigation?.headingTrue?.value !== "undefined" && this.isFresh(vessel.navigation.headingTrue))
          vessel_heading = GeoMath.rad2deg(vessel.navigation.headingTrue.value);
        //COG works, but is really wonky - lets only use when they are moving
        else if (typeof vessel.navigation?.courseOverGroundTrue?.value !== "undefined" && vessel_sog > 1)
          vessel_heading = GeoMath.rad2deg(vessel.navigation.courseOverGroundTrue.value);
        //true wind angle looks the cleanest on the map
        else if (this.twa !== false)
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
            this.vessels[vessel.mmsi]._popup.setContent(`${vessel.name} at ${distance} meters`);
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
              icon: this.gpsAntennaIcon
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

    if (this.isAnchored) {
      this.waitingForTheDrop = true;
      $.post('/plugins/hoekens-anchor-alarm/setRadius', { radius: newRadius })
        .fail((response) => {
          if (response.status == 401)
            location.href = "/admin/#/login";
        })
        .always(() => {
          this.waitingForTheDrop = false;
        });
    }
  }

  uiSetRadiusColor() {
    if (GeoMath.calculateDistance(this.anchorRadiusCircle.getLatLng().lat, this.anchorRadiusCircle.getLatLng().lng, this.myBoatMarker.getLatLng().lat, this.myBoatMarker.getLatLng().lng) > this.anchorRadiusCircle.getRadius())
      this.anchorRadiusCircle.setStyle({ 'color': 'red' })
    else if (this.isAnchored)
      this.anchorRadiusCircle.setStyle({ 'color': 'green' })
    else
      this.anchorRadiusCircle.setStyle({ 'color': 'blue' })
  }

  dropAnchor(position, radius) {
    $('#anchorDown').show();
    $('#anchorUp').hide();

    this.anchorCoordinates = position;

    this.isAnchored = true;

    $('#scopeUI').hide();
    $('#infoUI').show();

    this.maxRadius = parseInt(radius);
    if (this.maxRadius <= 0)
      this.maxRadius = 20;

    if (typeof this.crosshairMarker !== "undefined") {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = undefined;
    }

    this.anchorRadiusCircle.setLatLng(position);
    this.uiSetRadius(this.maxRadius)

    this.anchorMarker = L.marker(position, {
      icon: this.anchorIcon
    }).addTo(this.map);
  }

  raiseAnchor() {
    $('#anchorUp').show();
    $('#anchorDown').hide();

    this.isAnchored = false;

    $('#infoUI').hide();
    $('#scopeUI').show();

    if (typeof this.anchorMarker !== "undefined") {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = undefined;
    }

    this.uiSetRadiusColor();

    this.crosshairMarker = L.marker(this.anchorCoordinates, {
      icon: this.crosshairIcon,
      draggable: true
    }).addTo(this.map);

    this.crosshairMarker.on('drag', (ev) => {
      if (!this.isAnchored) {
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
      let kts = Math.round(speedApparent * 1.94384);
      $('#awsValue').html(`${kts}kts`);

      const windBarbIcon = getWindBarb(speedApparent);
      $('#windBarbContainer').html(windBarbIcon);
      $('#windBarbContainer svg').css('transform', `rotate(${Math.round(this.twa)}deg)`);
      console.log(this.twa);
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
