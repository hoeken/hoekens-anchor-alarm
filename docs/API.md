# API reference

The plugin is primarily driven through its web UI, but it also exposes a small
API so you can drive it from another app, a dashboard, or a script. There are
two surfaces:

- an **[HTTP/REST API](#http-rest-api)** for controlling the anchor (drop, set
  the watch zone, raise) and managing UI settings and the custom boat icon, and
- a **[Signal K data model](#signal-k-data-model)** — the paths the plugin
  publishes on the Signal K tree that any Signal K consumer can subscribe to.

The machine-readable OpenAPI 3 spec for the HTTP API lives in
[`src/openApi.json`](../src/openApi.json). Because the plugin registers it with
the server, you can also browse it interactively in the Signal K admin UI under
**Documentation → OpenAPI → hoekens-anchor-alarm**.

---

## HTTP / REST API

All routes are served under the plugin's base path:

```
/plugins/hoekens-anchor-alarm
```

So the full URL for dropping the anchor is, for example:

```
POST http://[signalk-server]:[port]/plugins/hoekens-anchor-alarm/dropAnchor
```

### Authentication

Write operations (dropping/raising the anchor, changing the zone, saving
settings, uploading/deleting the icon) require you to be authenticated with the
Signal K server, which gates write methods on plugin routes. Read operations
(`GET /ui-config`, `GET /icon`) are public.

If you are calling the API from a script rather than a logged-in browser
session, authenticate with the server first and send the resulting token — see
the [Signal K security docs](https://demo.signalk.org/documentation/develop/security.html)
for how to obtain and use a JWT.

### Response envelope

Success responses share a common envelope:

```json
{ "statusCode": 200, "state": "COMPLETED" }
```

Errors share their own envelope, with an HTTP status matching `statusCode`:

```json
{
  "statusCode": 403,
  "state": "FAILED",
  "message": "position with latitude and longitude required"
}
```

| Status | Meaning                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `403`  | Validation or anchor-state error (e.g. missing position, boat outside the zone, no anchor dropped). The `message` explains what went wrong. |
| `500`  | Unexpected internal error.                                                                                                                  |

(The `icon` upload route adds `400`, `413`, and `415` — see below.)

### Anchor control

#### `POST /dropAnchor`

Records the supplied position as the anchor location, optionally sets the watch
zone, and starts the anchor watch.

Request body:

| Field      | Type   | Required | Notes                                                                                                 |
| ---------- | ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `position` | object | yes      | `{ "latitude": <number>, "longitude": <number> }`, decimal degrees (WGS84).                           |
| `zone`     | object | no       | Watch zone (see [Zone object](#zone-object)). If omitted, the previously configured zone is retained. |
| `radius`   | number | no       | Legacy alarm radius in meters. If both `zone` and `radius` are given, `zone` wins.                    |

```bash
curl -X POST http://[signalk-server]:[port]/plugins/hoekens-anchor-alarm/dropAnchor \
  -H 'Content-Type: application/json' \
  -d '{ "position": { "latitude": 37.8199, "longitude": -122.4783 }, "zone": { "type": "circle", "radius": 30 } }'
```

The drop is rejected (`403`) if the boat's current GPS position is already
outside the requested zone — dropping there would trip the drag alarm
immediately. (This guard is skipped when there is no GPS fix, or when the
`allowZoneOutsideVessel` config option is enabled for alarm testing.)

#### `POST /setZone`

Updates the watch zone for the currently dropped anchor without moving the
anchor position. Requires that an anchor has already been dropped and that a GPS
position is available.

Request body:

| Field  | Type   | Required | Notes                                         |
| ------ | ------ | -------- | --------------------------------------------- |
| `zone` | object | yes      | Watch zone (see [Zone object](#zone-object)). |

```bash
curl -X POST http://[signalk-server]:[port]/plugins/hoekens-anchor-alarm/setZone \
  -H 'Content-Type: application/json' \
  -d '{ "zone": { "type": "circle", "radius": 45 } }'
```

Like `dropAnchor`, this is rejected (`403`) if the new zone would no longer
contain the boat (unless `allowZoneOutsideVessel` is enabled).

#### `POST /raiseAnchor`

Clears the anchor position and radius and stops the anchor watch. Takes no body.

```bash
curl -X POST http://[signalk-server]:[port]/plugins/hoekens-anchor-alarm/raiseAnchor
```

#### Zone object

The `zone` object passed to `dropAnchor` and `setZone`:

| Field        | Type   | Applies to     | Notes                                                                                                                                 |
| ------------ | ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | string | all            | `"circle"` or `"sector"`.                                                                                                             |
| `radius`     | number | circle, sector | Alarm radius in meters.                                                                                                               |
| `startAngle` | number | sector         | Clockwise bearing in degrees (0 = true north) of the start of the safe arc.                                                           |
| `endAngle`   | number | sector         | Clockwise bearing in degrees (0 = true north) of the end of the safe arc. When `endAngle < startAngle`, the arc wraps across 0°/360°. |

> The web UI can also draw free-form **polygon** zones. Polygons are set through
> the UI (and stored/published on the tree); the `circle` and `sector` shapes
> above are the ones accepted by these two HTTP endpoints.

### UI configuration

#### `GET /ui-config`

Returns the plugin configuration values the web UI needs at startup. Unset
properties are omitted (the UI applies its own defaults). Public — no auth
required.

Response fields:

| Field               | Type    | Notes                                                                                           |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `defaultBasemap`    | string  | `"OpenStreetMap"`, `"Satellite"`, or `"Blank"`.                                                 |
| `defaultShape`      | string  | `"circle"`, `"sector"`, or `"polygon"`. Default new-zone shape.                                 |
| `fleetFilterRadius` | integer | Radius (meters) around own vessel for showing other vessels and tracks.                         |
| `enableTidePanel`   | boolean | Show the tide panel while anchored.                                                             |
| `enableWindPanel`   | boolean | Show the wind panel.                                                                            |
| `enableScopePanel`  | boolean | Show the scope/depth calculator while the anchor is up.                                         |
| `enableBoatLabels`  | boolean | Show other vessels' names as labels (when zoomed in enough).                                    |
| `enableSeascape`    | boolean | Overlay Seascape bathymetry by default.                                                         |
| `hasCustomIcon`     | boolean | **Read-only, derived.** Whether a custom own-boat icon has been uploaded. Not a stored setting. |

#### `POST /ui-config`

Persists UI-editable settings. Only the whitelisted keys above are accepted
(`hasCustomIcon` is ignored on write); each is validated, written onto the live
plugin configuration, and saved. Requires authentication.

```bash
curl -X POST http://[signalk-server]:[port]/plugins/hoekens-anchor-alarm/ui-config \
  -H 'Content-Type: application/json' \
  -d '{ "enableTidePanel": false, "fleetFilterRadius": 750 }'
```

On success the response echoes the coerced updates:

```json
{
  "statusCode": 200,
  "state": "COMPLETED",
  "config": { "enableTidePanel": false, "fleetFilterRadius": 750 }
}
```

### Custom boat icon

A custom own-boat icon shown on the map. The image is stored as a single file in
the plugin data directory; the type is detected from the file's magic bytes, so
the `Content-Type` header is not trusted.

#### `GET /icon`

Serves the uploaded icon with its detected image content type. Returns `404`
(`"no custom boat icon set"`) when none is set. Public.

#### `PUT /icon`

Uploads (or replaces) the icon. The body is the **raw image bytes**. Accepts
`jpg`, `png`, `gif`, or `webp`, up to **500 KB**. Requires authentication.

```bash
curl -X PUT http://[signalk-server]:[port]/plugins/hoekens-anchor-alarm/icon \
  --data-binary @my-boat.png
```

Errors specific to this route:

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| `400`  | Empty upload.                                    |
| `413`  | Image exceeds the 500 KB size limit.             |
| `415`  | Body is not a recognized jpg/png/gif/webp image. |

#### `DELETE /icon`

Removes any stored icon; the map reverts to the AIS ship-type icon. Idempotent —
succeeds whether or not an icon was set. Requires authentication.

---

## Signal K data model

While watching, the plugin publishes anchor state on the Signal K tree as
deltas, and emits the alarm as a notification. Any Signal K consumer (the REST
API, a WebSocket subscription, another plugin, an MFD) can read these. This is
how integrations such as Freeboard and `signalk-autostate` interoperate with the
anchor watch.

### Published paths

Under `vessels.self`:

| Path                                | Value                     | Units | Notes                                                                                               |
| ----------------------------------- | ------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| `navigation.anchor.state`           | `"on"` / `"off"`          | —     | Whether the anchor is set and being watched.                                                        |
| `navigation.anchor.position`        | `{ latitude, longitude }` | —     | Anchor position; `null` when raised.                                                                |
| `navigation.anchor.currentRadius`   | number                    | m     | Straight-line distance from the GPS antenna to the anchor. Refreshed on every position fix.         |
| `navigation.anchor.maxRadius`       | number                    | m     | Circle radius for circle zones (kept for consumers like Freeboard). `null` for non-circle zones.    |
| `navigation.anchor.watchZone`       | object                    | —     | Watch zone shape + parameters. The canonical source of truth for the zone.                          |
| `navigation.anchor.distanceFromBow` | number                    | m     | Distance from the bow to the anchor.                                                                |
| `navigation.anchor.bearingTrue`     | number                    | rad   | True bearing from the bow to the anchor.                                                            |
| `navigation.anchor.apparentBearing` | number                    | rad   | Bearing from the bow to the anchor relative to vessel heading; `null` when no heading is available. |
| `navigation.anchor.meta`            | object                    | —     | `zones` array (`normal`/alarm bands) for circle zones, for legacy consumers.                        |
| `design.bowAnchorRollerHeight`      | number                    | m     | Published from config when set; used by the scope calculator.                                       |
| `design.totalAnchorChainLength`     | number                    | m     | Published from config when set; used by the scope calculator.                                       |

All bearings follow the Signal K convention (radians). When the anchor is
raised, the anchor paths above are set to `null` / `"off"`.

While a watch is active, the static anchor paths (`position`, `state`,
`watchZone`, `maxRadius`) are also re-broadcast periodically (every 5 minutes),
so a consumer that starts or restarts mid-watch picks them up without waiting for
the next drop or raise.

### Alarm notification

The drag/watch alarm is published on:

```
notifications.navigation.anchor
```

as a Signal K notification value:

```json
{
  "state": "alarm",
  "method": ["visual", "sound"],
  "message": "Anchor Dragging (42m)"
}
```

- `state` — the notification level. `normal` while watching/idle; the configured
  alarm level (e.g. `alarm`, `emergency`) while dragging. Position-glitch
  warnings surface here at `warn`.
- `method` — `["visual", "sound"]` for a drag alarm; informational updates use
  `["visual"]` only.
- `message` — human-readable status, e.g. `"Watching"`,
  `"Anchor Dragging (42m)"`, `"Engines on, alarm disabled."`.

If the `enableNormalNotifications` config option is turned off, the plugin clears
this notification (rather than emitting a `normal`-state message) when idle, to
reduce clutter. Drag alarms are unaffected.

### Legacy PUT handlers

For backwards compatibility with the original `signalk-anchoralarm-plugin`, the
plugin also registers Signal K PUT (action) handlers on:

- `navigation.anchor.position` — PUT a `{ latitude, longitude }` value (with an
  optional `radius`) to drop the anchor, or `null` to raise it.
- `navigation.anchor.maxRadius` — PUT a number to set the circle radius.

These are provided only for compatibility; **the [HTTP API](#http-rest-api)
above is the canonical way to control the anchor.**
