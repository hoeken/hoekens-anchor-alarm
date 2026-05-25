# v2.2

## UI - SectorZone

### Data model

Zone config (persisted as JSON in `plugin.configuration.zone`, mirrored on `navigation.anchor.watchZone`):

```js
{ type: "sector", radius, startAngle, endAngle }
```

- `radius`: meters, same semantics as CircleZone.
- `startAngle`, `endAngle`: degrees, clockwise from true north, in `[0, 360)`. The sector spans clockwise from `startAngle` to `endAngle` — when `endAngle < startAngle` the arc wraps across 0°/360°.
- No new library dependency — all math uses existing `haversineDistance` + `GeoMath.calculateBearing` / `calculateDestinationPoint`.

### Shared (backend + UI) — `shared/watch-zones/SectorZone.js`

Mirror the `CircleZone` shape:

- `getType() → "sector"`
- `getConfig() → { type, radius, startAngle, endAngle }`
- `getCircleRadius() → this.radius` — keep `navigation.anchor.maxRadius` and the legacy `meta.zones` array populated for Freeboard and other external consumers. The plugin's own alarm uses `contains()`; emitting `maxRadius` is mildly conservative (would alert in cases the sector wouldn't) but never misses a drag.
- `contains(vessel, anchor)`:
  - `d = haversineDistance(...)`; if `d > radius` return false.
  - `b = GeoMath.calculateBearing(anchor, vessel)` (0–360°).
  - True when `b` is inside the clockwise arc `startAngle → endAngle`. Wraparound rule: `(b - startAngle + 360) % 360 <= (endAngle - startAngle + 360) % 360`.
  - When `vessel` or `anchor` is missing → return true (matches CircleZone).
- `getBoundingBox(anchor)` — reuse the circle bounding box (loose bound is fine for `fitBounds`; tightening to the sector adds code without a visible payoff).

Register in `shared/watch-zones/index.js`:

- Add `case "sector": return new SectorZone(config)` to `watchZoneFromConfig`.
- Add `"sector"` to `SUPPORTED_ZONE_TYPES`.

### Backend wiring

- `src/openApi.json`: extend `/setZone` schema — add `"sector"` to the type enum and document `startAngle` / `endAngle`. Add an example.
- `src/index.js`: no changes required. `setZone`/`dropAnchor` already round-trip arbitrary zone shapes through `resolveZone → watchZoneFromConfig`. The `getCircleRadius` branch already handles the maxRadius/meta emission correctly.

### UI overlay — `ui/js/hud/zones/SectorZoneOverlay.js`

Built around an `L.polygon` (Leaflet has no `L.sector` primitive). Construction:

- Sample N points (32–48) along the arc using `GeoMath.calculateDestinationPoint(anchor, bearing, radius)` stepping from `startAngle` to `endAngle` (clockwise, handling wraparound).
- Polygon points = `[anchor, ...arcPoints, anchor]` (closed back to apex).

Three `ZoneHandle`s:

1. **Radius handle** — on the bisector ray at current radius. Bisector bearing = `(startAngle + halfwidth)` where `halfwidth = ((endAngle - startAngle + 360) % 360) / 2`. Dragging changes only the radius (project the drag latlng onto the bisector direction, take its distance; angle is locked to the bisector). Clamp to `MIN_RENDER_RADIUS_M = 20` (same constant CircleZone uses).
2. **Start-angle handle** — on the arc at the current radius along the `startAngle` ray. Dragging changes only `startAngle`: take bearing from anchor to cursor, snap the handle back to that bearing at current radius (don't let the user resize via this handle).
3. **End-angle handle** — same, for `endAngle`.

Constraints during drag:

- Minimum arc width: `MIN_ARC_DEGREES = 10`. When dragging a start/end handle, clamp so `((endAngle - startAngle + 360) % 360) >= 10`. (Two interpretations of "minimum 10°" yield the same value when measured as the included sector — confirm this is what was meant.)
- Maximum arc width: `<= 350°` (or allow up to 360°? A 360° sector is just a circle; recommend cap at 350° so the handles can't visually overlap).

Live preview: same pattern as `CircleZoneOverlay` — `onInput(zoneConfig)` during drag, `onChange(zoneConfig)` on dragend. The `previewZone` plumbing in `AnchorController` already handles this for any shape.

Color/style: reuse `setColor()` and `setStyle()` paths from CircleZoneOverlay; polygon stroke color matches the alarm state (green/blue/red), and `ZoneHandle.setStyle({ color })` applies to all three handles.

### UI controls — `ui/js/hud/zones/SectorZoneControls.js`

- Radius stepper: identical to `CircleZoneControls` (`#radiusControl`, `-` / value / `+`, prompt-on-click). +/- step of 5m, display via `DisplayUnit`.
- No control bar for angles — angles are edited only via the map handles.

### Registry — `ui/js/hud/zones/index.js`

Flip the `sector` entry to `enabled: true` and wire up:

```js
sector: { label: "Sector", overlay: SectorZoneOverlay, controls: SectorZoneControls, enabled: true },
```

Add the `import` lines for the two new classes. `ControlToolbar`'s `#zoneShape` `change` handler currently has a hard-coded `if (newType === "circle")` branch — replace with `if (this._onSetZone) this._onSetZone({ type: newType })` so the generic dispatch path handles every shape (resolveZone backfills missing params from existing config).

### Defaults

When the user switches the shape selector to "Sector" with no existing sector config:

- `radius`: inherit from current circle radius if present, otherwise the existing default (60m).
- `startAngle` / `endAngle`: centered on current vessel heading (from `appState.boatConfig.heading`), 120° wide → `startAngle = heading - 60`, `endAngle = heading + 60`, both normalized into `[0, 360)`. Fall back to `centerBearing = 0` (north-centered) when heading is unavailable.
- Apply in `resolveZone` / a small helper in `ControlToolbar` so the first `setZone({ type: "sector" })` POST carries the full config.

### Out of scope for this PR

- Polygon zone (stays `enabled: false` in registry).
- Persisting "last-used shape" across sessions (covered separately under UI - Config).

## UI - Config

- loading
  - ui config is already stored as AnchorAlarm.config
  - attempt to load from cookies or other local storage
  - if not, load from server
  - if not, fall back to defaults in AnchorAlarm.config
- add local config editing
  - map overlay button + dialog
  - simple button that toggles edit ui
  - generate config json, save to AnchorAlarm.config
  - save to cookies / local storage
  - save to app or nah?

# LONG TERM

## UI - Tide Box

- split the tide info out from the infobox
- show a small graphical tide representation
- on click -> tides plugin webapp
- make display configurable in the UI.

- check if https://github.com/SignalK/signalk-server/pull/2498 is merged yet
- custom boat icon upload
- possible glitch filter - filter any moves that are over X speed